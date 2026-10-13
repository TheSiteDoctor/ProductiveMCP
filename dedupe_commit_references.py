#!/usr/bin/env python3
"""
dedupe_commit_references.py

Clear clashing "Commit reference" values on Productive tasks.

Productive stamps each task's Commit reference via a webhook, and concurrent
creation can hand the same reference to several tasks. This script finds every
Commit reference that appears on more than one task in a project, keeps it on
the task with the LOWEST Productive id, and clears it from the rest.

Safe by default:
  * Runs as a DRY RUN unless you pass --apply.
  * Reads and rewrites each task's full custom-field set, so clearing the
    Commit reference never disturbs the others (Task type, Priority, Ball Park...).
  * Leaves a configurable gap between writes so the Commit-reference webhook
    does not fire several times at once, with automatic back-off on rate limits.

Requires: Python 3.9+ and the `requests` package  (pip install requests)
Optional: `python-dotenv` (pip install python-dotenv) - used if present.

Credentials are read from a .env file in the working directory (never hard-code
them). Expected keys:
  PRODUCTIVE_API_TOKEN=your-personal-access-token
  PRODUCTIVE_ORG_ID=your-organisation-id
Real environment variables, if set, take precedence over the .env file. Point
at a different file with --env-file.

Usage:
  # Preview only (no changes):
  python dedupe_commit_references.py 1044695

  # Apply the changes:
  python dedupe_commit_references.py 1044695 --apply

  # Tune the gap between writes (milliseconds), or use a different env file:
  python dedupe_commit_references.py 1044695 --apply --delay-ms 400
  python dedupe_commit_references.py 1044695 --env-file config/.env
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterator

import requests

DEFAULT_API_BASE = "https://api.productive.io/api/v2"
DEFAULT_FIELD_NAME = "Commit reference"
DEFAULT_DELAY_MS = 1000
DEFAULT_PAGE_SIZE = 200
DEFAULT_ENV_FILE = ".env"

# Value written to clear the field. Productive clears a text custom field on
# null; if your instance prefers an empty string, set this to "".
CLEAR_VALUE: Any = None


# --- Configuration ----------------------------------------------------------

def load_env_file(path: str = DEFAULT_ENV_FILE) -> None:
    """Load KEY=VALUE pairs from a .env file into os.environ.

    Existing environment variables win (so a real export overrides the file).
    Uses python-dotenv when installed, otherwise a minimal built-in parser.
    """
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(path, override=False)
        return
    except ImportError:
        pass

    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


# --- Domain model -----------------------------------------------------------

@dataclass(frozen=True)
class TaskRef:
    """A single Productive task and its Commit reference."""
    id: int
    title: str
    reference: str
    custom_fields: dict[str, Any]


@dataclass
class Clearance:
    """One duplicate group: the reference, the keeper, and the tasks to clear."""
    reference: str
    keeper: TaskRef
    to_clear: list[TaskRef] = field(default_factory=list)


# --- Productive API client --------------------------------------------------

class ProductiveClient:
    def __init__(self, token: str, org_id: str, base: str = DEFAULT_API_BASE) -> None:
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/vnd.api+json",
            "X-Auth-Token": token,
            "X-Organization-Id": org_id,
        })
        self._base = base.rstrip("/")

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{self._base}/{path.lstrip('/')}"
        for attempt in range(5):
            resp = self._session.request(method, url, timeout=30, **kwargs)
            if resp.status_code == 429:  # rate limited - back off and retry
                wait = float(resp.headers.get("Retry-After", 2 ** attempt))
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json() if resp.content else {}
        raise RuntimeError(f"Gave up after repeated 429s on {method} {url}")

    def resolve_field_id(self, field_name: str) -> str:
        """Find the id of the (non-archived) task custom field with this name."""
        page = 1
        while True:
            data = self._request(
                "GET", "custom_fields",
                params={
                    "filter[customizable_type]": "tasks",
                    "page[size]": 100,
                    "page[number]": page,
                },
            )
            for cf in data.get("data", []):
                attrs = cf.get("attributes", {})
                if attrs.get("name") == field_name and not attrs.get("archived"):
                    return cf["id"]
            meta = data.get("meta", {})
            if page >= int(meta.get("total_pages", page)):
                break
            page += 1
        raise SystemExit(f'Could not find a task custom field named "{field_name}".')

    def iter_project_tasks(self, project_id: str, field_id: str,
                           page_size: int) -> Iterator[TaskRef]:
        """Yield every task in the project, with its Commit reference value."""
        page = 1
        while True:
            data = self._request(
                "GET", "tasks",
                params={
                    "filter[project_id]": project_id,
                    "fields[tasks]": "title,custom_fields",
                    "page[size]": page_size,
                    "page[number]": page,
                },
            )
            rows = data.get("data", [])
            for row in rows:
                attrs = row.get("attributes", {})
                custom_fields = attrs.get("custom_fields") or {}
                raw = custom_fields.get(field_id)
                reference = str(raw).strip() if raw not in (None, "") else ""
                yield TaskRef(
                    id=int(row["id"]),
                    title=attrs.get("title", ""),
                    reference=reference,
                    custom_fields=dict(custom_fields),
                )
            meta = data.get("meta", {})
            if not rows or page >= int(meta.get("total_pages", page)):
                break
            page += 1

    def clear_reference(self, task: TaskRef, field_id: str) -> None:
        """Clear one task's Commit reference, preserving all other custom fields."""
        new_fields = dict(task.custom_fields)
        new_fields[field_id] = CLEAR_VALUE
        self._request(
            "PATCH", f"tasks/{task.id}",
            json={
                "data": {
                    "type": "tasks",
                    "id": str(task.id),
                    "attributes": {"custom_fields": new_fields},
                }
            },
        )


# --- Pure planning logic ----------------------------------------------------

def plan_clearances(tasks: list[TaskRef]) -> list[Clearance]:
    """Group by reference; keep the lowest id, mark the rest for clearing."""
    groups: dict[str, list[TaskRef]] = defaultdict(list)
    for task in tasks:
        if task.reference:
            groups[task.reference].append(task)

    plan: list[Clearance] = []
    for reference, members in groups.items():
        if len(members) < 2:
            continue  # unique reference - nothing to do
        members.sort(key=lambda t: t.id)  # lowest Productive id first
        plan.append(Clearance(reference=reference,
                              keeper=members[0],
                              to_clear=members[1:]))
    plan.sort(key=lambda c: c.keeper.id)
    return plan


# --- Runner -----------------------------------------------------------------

def run(project_id: str, field_name: str, delay_ms: int,
        page_size: int, apply: bool, env_file: str) -> int:
    load_env_file(env_file)

    token = os.environ.get("PRODUCTIVE_API_TOKEN")
    org_id = os.environ.get("PRODUCTIVE_ORG_ID")
    if not token or not org_id:
        raise SystemExit(
            f"PRODUCTIVE_API_TOKEN and PRODUCTIVE_ORG_ID must be set "
            f"(looked in the environment and in {env_file}).")
    base = os.environ.get("PRODUCTIVE_API_BASE", DEFAULT_API_BASE)

    client = ProductiveClient(token, org_id, base)
    field_id = client.resolve_field_id(field_name)
    print(f'Using custom field "{field_name}" (id {field_id}).')

    tasks = list(client.iter_project_tasks(project_id, field_id, page_size))
    with_ref = sum(1 for t in tasks if t.reference)
    print(f"Scanned {len(tasks)} tasks; {with_ref} carry a {field_name}.")

    plan = plan_clearances(tasks)
    if not plan:
        print("No clashes found - nothing to clear.")
        return 0

    total_to_clear = sum(len(c.to_clear) for c in plan)
    print(f"Found {len(plan)} clashing references covering "
          f"{total_to_clear} tasks to clear.\n")

    for c in plan:
        print(f'  {c.reference}: keep #{c.keeper.id} "{c.keeper.title}"')
        for t in c.to_clear:
            print(f'      clear #{t.id} "{t.title}"')

    if not apply:
        print("\nDRY RUN - no changes made. Re-run with --apply to clear these.")
        return 0

    print(f"\nApplying: clearing {total_to_clear} references "
          f"({delay_ms}ms between writes)...")
    cleared = failed = 0
    for c in plan:
        for t in c.to_clear:
            try:
                client.clear_reference(t, field_id)
                cleared += 1
                print(f"  cleared #{t.id} (was {c.reference})")
            except Exception as exc:  # report and continue with the rest
                failed += 1
                print(f"  FAILED  #{t.id}: {exc}", file=sys.stderr)
            time.sleep(delay_ms / 1000.0)

    print(f"\nDone. Cleared {cleared}, failed {failed}.")
    return 1 if failed else 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clear duplicate Productive Commit references, "
                    "keeping the lowest task id.")
    parser.add_argument("project_id", help="Productive project id, e.g. 1044695")
    parser.add_argument("--field-name", default=DEFAULT_FIELD_NAME,
                        help=f'Custom field name (default: "{DEFAULT_FIELD_NAME}")')
    parser.add_argument("--delay-ms", type=int, default=DEFAULT_DELAY_MS,
                        help=f"Gap between writes in ms (default: {DEFAULT_DELAY_MS})")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE,
                        help=f"Task page size (default: {DEFAULT_PAGE_SIZE})")
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE,
                        help=f'Path to the .env file (default: "{DEFAULT_ENV_FILE}")')
    parser.add_argument("--apply", action="store_true",
                        help="Make the changes (omit for a dry run)")
    args = parser.parse_args()
    sys.exit(run(args.project_id, args.field_name, args.delay_ms,
                 args.page_size, args.apply, args.env_file))


if __name__ == "__main__":
    main()
