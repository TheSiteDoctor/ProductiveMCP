/**
 * Shared test helpers: a fake Productive API with enough behaviour for the
 * template, task and milestone tools.
 */

/**
 * A stateful fake project. Lists and tasks created by one call are visible to
 * the next. Optionally simulates the Commit reference automation.
 *
 * reference: { prefix, delayMs, start } stamps `${prefix}-${n}` onto each new
 * task after delayMs, choosing n from the highest reference that exists when
 * it stamps - so creating a task before the previous one is stamped produces a
 * duplicate, just like the real automation.
 */
export function fakeProject({ reference, refFieldId = "160540", titlePrefix = true } = {}) {
  const lists = [];
  const tasks = [];
  const comments = [];
  const calls = [];
  let next = 5000;

  const stampReference = (task) => {
    const used = tasks.map((t) => t.custom_fields[refFieldId]).filter(Boolean)
      .map((r) => parseInt(String(r).split("-")[1], 10));
    const n = used.length > 0 ? Math.max(...used) + 1 : reference.start;
    const ref = `${reference.prefix}-${n}`;
    task.custom_fields[refFieldId] = ref;
    if (titlePrefix) task.title = `[${ref}] ${task.title}`;
  };

  const taskResource = (t) => ({
    type: "tasks",
    id: t.id,
    attributes: {
      title: t.title,
      type_id: t.type_id ?? 1,
      due_date: t.due_date ?? null,
      custom_fields: { ...t.custom_fields },
      closed: false,
      created_at: "2026-11-13T09:00:00Z",
    },
    relationships: {
      project: { data: { type: "projects", id: "9999" } },
      task_list: { data: { type: "task_lists", id: t.list } },
      // Like Productive, relationship data only appears when it's included.
      parent_task: t.includeParent
        ? { data: t.parent ? { type: "tasks", id: t.parent } : null }
        : { meta: { included: false } },
    },
  });

  const client = {
    lists, tasks, comments, calls,
    getOrgId: () => "42",
    async get(path, params = {}) {
      calls.push({ method: "GET", path, params });
      const include = String(params.include || "").split(",");
      const view = (t) => taskResource({ ...t, includeParent: include.includes("parent_task") });
      if (path === "/task_lists") {
        return { data: lists.map((l) => ({ type: "task_lists", id: l.id, attributes: { name: l.name } })) };
      }
      if (path === "/boards") return { data: [{ type: "boards", id: "3", attributes: { name: "Board" } }] };
      if (path === "/tasks") {
        let rows = tasks;
        if (params["filter[parent_task_id]"]) rows = rows.filter((t) => t.parent === params["filter[parent_task_id]"]);
        if (params["filter[task_list_id]"]) rows = rows.filter((t) => t.list === params["filter[task_list_id]"]);
        if (params["filter[type_id]"]) rows = rows.filter((t) => (t.type_id ?? 1) === Number(params["filter[type_id]"]));
        const refFilter = Object.keys(params).find((k) => k.startsWith("filter[custom_fields]"));
        if (refFilter) rows = rows.filter((t) => t.custom_fields[refFieldId] === params[refFilter]);
        return { data: rows.map(view), meta: { total_count: rows.length } };
      }
      const one = path.match(/^\/tasks\/(\d+)$/);
      if (one) {
        const t = tasks.find((x) => x.id === one[1]);
        return { data: t ? view(t) : null };
      }
      if (path === "/comments") {
        const rows = comments.filter((c) => c.task === params["filter[task_id]"]);
        return { data: rows.map((c) => ({ type: "comments", id: c.id, attributes: { body: c.body, hidden: c.hidden } })) };
      }
      return { data: [] };
    },
    async post(path, payload) {
      calls.push({ method: "POST", path, payload });
      const id = String(next++);
      if (path === "/task_lists") lists.push({ id, name: payload.data.attributes.name });
      if (path === "/tasks") {
        const a = payload.data.attributes;
        const r = payload.data.relationships;
        const task = {
          id, title: a.title, type_id: a.type_id, due_date: a.due_date,
          custom_fields: { ...(a.custom_fields || {}) },
          list: r.task_list?.data?.id, parent: r.parent_task?.data?.id,
        };
        tasks.push(task);
        if (reference) {
          if (reference.delayMs > 0) setTimeout(() => stampReference(task), reference.delayMs);
          else stampReference(task);
        }
        return { data: taskResource(task) };
      }
      if (path === "/comments") {
        const c = { id, task: payload.data.relationships.task?.data?.id, body: payload.data.attributes.body, hidden: payload.data.attributes.hidden };
        comments.push(c);
        return { data: { type: "comments", id, attributes: { body: c.body, hidden: c.hidden } } };
      }
      return { data: { type: path.slice(1), id } };
    },
    async patch(path, payload) {
      calls.push({ method: "PATCH", path, payload });
      const one = path.match(/^\/tasks\/(\d+)$/);
      if (one) {
        const t = tasks.find((x) => x.id === one[1]);
        const a = payload.data.attributes || {};
        if (a.custom_fields) t.custom_fields = { ...a.custom_fields };
        if ("due_date" in a) t.due_date = a.due_date;
        const rel = payload.data.relationships || {};
        if ("parent_task" in rel) t.parent = rel.parent_task.data?.id;
        return { data: taskResource({ ...t, includeParent: true }) };
      }
      const c = path.match(/^\/comments\/(\d+)$/);
      if (c) {
        const comment = comments.find((x) => x.id === c[1]);
        comment.body = payload.data.attributes.body;
        return { data: { type: "comments", id: comment.id, attributes: { body: comment.body } } };
      }
      return { data: {} };
    },
    async delete(path) {
      calls.push({ method: "DELETE", path });
      const c = path.match(/^\/comments\/(\d+)$/);
      if (c) comments.splice(comments.findIndex((x) => x.id === c[1]), 1);
      return {};
    },
  };
  return client;
}

/** Arguments for productive_apply_task_template with the usual defaults. */
export const applyArgs = (overrides) => ({
  project_id: "9999",
  reuse_existing_task_lists: true,
  skip_existing_tasks: true,
  dry_run: false,
  response_format: "json",
  ...overrides,
});
