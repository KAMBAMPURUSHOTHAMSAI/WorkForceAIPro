import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FilePlus2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import api from "../api/axios";

const SECRET_FIELD_NAMES = new Set([
  "password_hash",
  "token_hash",
  "access_token",
  "refresh_token",
  "password",
  "secret_key",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(path) {
  const leading = path.startsWith("/") ? path : `/${path}`;
  return leading.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function getApiPrefix() {
  try {
    return normalizePath(new URL(api.defaults.baseURL).pathname);
  } catch {
    return "/api/v1";
  }
}

function collectionPath(endpoint) {
  const prefix = getApiPrefix();
  const path = normalizePath(endpoint);
  return normalizePath(path.startsWith(prefix) ? path : `${prefix}${path}`);
}

function pathParts(path) {
  return normalizePath(path).split("/").filter(Boolean);
}

function pathsMatch(candidate, actual) {
  const expectedParts = pathParts(candidate);
  const actualParts = pathParts(actual);

  if (expectedParts.length !== actualParts.length) return false;

  return expectedParts.every((part, index) => {
    if (/^\{[^/]+\}$/.test(part)) return /^\{[^/]+\}$/.test(actualParts[index]);
    return part === actualParts[index];
  });
}

function findOpenApiPath(openApi, candidate, method) {
  if (!openApi?.paths) return null;

  const normalized = normalizePath(candidate);
  const operation = method.toLowerCase();

  if (openApi.paths[normalized]?.[operation]) return normalized;

  return Object.entries(openApi.paths).find(
    ([path, methods]) => methods?.[operation] && pathsMatch(normalized, path)
  )?.[0] ?? null;
}

function resolveSchema(schema, components, depth = 0) {
  if (!schema || depth > 16) return {};

  let result = { ...schema };

  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    const referenced = resolveSchema(components?.[name], components, depth + 1);
    result = { ...referenced, ...result };
    delete result.$ref;
  }

  if (Array.isArray(schema.allOf)) {
    const combined = {
      ...result,
      properties: { ...(result.properties || {}) },
      required: [...(result.required || [])],
    };

    for (const item of schema.allOf) {
      const resolved = resolveSchema(item, components, depth + 1);
      Object.assign(combined.properties, resolved.properties || {});
      combined.required = [...new Set([
        ...combined.required,
        ...(resolved.required || []),
      ])];
      if (!combined.type && resolved.type) combined.type = resolved.type;
    }

    result = combined;
  }

  const variants = schema.anyOf || schema.oneOf;
  if (Array.isArray(variants)) {
    const selected = variants.find((item) => item.type !== "null") || variants[0];
    if (selected) {
      const resolved = resolveSchema(selected, components, depth + 1);
      result = { ...resolved, ...result };
      delete result.anyOf;
      delete result.oneOf;
    }
  }

  return result;
}

function getOperationInfo(openApi, candidate, method) {
  const matchedPath = findOpenApiPath(openApi, candidate, method);
  if (!matchedPath) return null;

  const operation = openApi.paths[matchedPath][method.toLowerCase()];
  const content = operation.requestBody?.content || {};
  const mediaType = [
    "application/json",
    "multipart/form-data",
    "application/x-www-form-urlencoded",
  ].find((type) => content[type]) || Object.keys(content)[0] || null;

  return {
    path: matchedPath,
    method: method.toUpperCase(),
    operation,
    mediaType,
    bodySchema: mediaType ? content[mediaType]?.schema || null : null,
    parameters: operation.parameters || [],
  };
}

function humanize(name) {
  return String(name)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getFields(info, components) {
  if (!info) return [];

  const fields = [];
  const bodySchema = resolveSchema(info.bodySchema, components);
  const requiredBody = new Set(bodySchema.required || []);

  for (const [name, originalSchema] of Object.entries(bodySchema.properties || {})) {
    const schema = resolveSchema(originalSchema, components);
    if (schema.readOnly === true || SECRET_FIELD_NAMES.has(name.toLowerCase())) continue;

    fields.push({
      name,
      label: humanize(name),
      schema,
      required: requiredBody.has(name),
      source: "body",
    });
  }

  for (const parameter of info.parameters || []) {
    if (parameter.in !== "query") continue;
    const schema = resolveSchema(parameter.schema || {}, components);
    fields.push({
      name: parameter.name,
      label: parameter.description || humanize(parameter.name),
      schema,
      required: Boolean(parameter.required),
      source: "query",
      description: parameter.description,
    });
  }

  return fields;
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInitialValues(fields, record = null) {
  return Object.fromEntries(fields.map((field) => {
    const { name, schema } = field;

    if (record && record[name] !== undefined && field.source !== "query") {
      const value = record[name];
      if (schema.type === "object" || schema.type === "array") {
        return [name, JSON.stringify(value, null, 2)];
      }
      if (schema.type === "boolean") return [name, value === true || value === 1 || value === "true"];
      if (schema.format === "date-time") return [name, toDateTimeLocal(value)];
      return [name, value == null ? "" : String(value)];
    }

    if (schema.default !== undefined) return [name, schema.default];
    if (schema.type === "boolean") return [name, false];
    if (schema.enum?.length && field.required) return [name, String(schema.enum[0])];
    return [name, ""];
  }));
}

function convertFieldValue(field, rawValue) {
  const { schema, label, required } = field;
  if (schema.format === "binary") {
    if (rawValue instanceof File) return rawValue;
    if (required) throw new Error(`${label} is required.`);
    return undefined;
  }

  if (rawValue === "" || rawValue === undefined || rawValue === null) {
    if (required) throw new Error(`${label} is required.`);
    return undefined;
  }

  let value = rawValue;
  if (schema.type === "integer" || schema.type === "number") {
    value = Number(rawValue);
    if (!Number.isFinite(value)) throw new Error(`${label} must be a valid number.`);
    if (schema.type === "integer" && !Number.isInteger(value)) {
      throw new Error(`${label} must be a whole number.`);
    }
    if (schema.minimum != null && value < schema.minimum) {
      throw new Error(`${label} must be at least ${schema.minimum}.`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      throw new Error(`${label} must be no more than ${schema.maximum}.`);
    }
  } else if (schema.type === "boolean") {
    value = rawValue === true || rawValue === "true" || rawValue === 1;
  } else if (schema.format === "date-time") {
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date and time.`);
    value = date.toISOString();
  } else if (schema.type === "array" || schema.type === "object") {
    try {
      value = JSON.parse(rawValue);
    } catch {
      throw new Error(`${label} must contain valid JSON.`);
    }
    if (schema.type === "array" && !Array.isArray(value)) {
      throw new Error(`${label} must be a JSON array.`);
    }
    if (schema.type === "object" && !isObject(value)) {
      throw new Error(`${label} must be a JSON object.`);
    }
  } else if (schema.enum?.length) {
    const matching = schema.enum.find((item) => String(item) === String(rawValue));
    if (matching !== undefined) value = matching;
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      throw new Error(`${label} must have at least ${schema.minLength} characters.`);
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      throw new Error(`${label} must have no more than ${schema.maxLength} characters.`);
    }
  }

  return value;
}

function makeRequestData(values, fields, mediaType) {
  const isMultipart = mediaType === "multipart/form-data";
  const isFormEncoded = mediaType === "application/x-www-form-urlencoded";
  const formData = new FormData();
  const json = {};
  const formEncoded = new URLSearchParams();
  const query = {};

  for (const field of fields) {
    const value = convertFieldValue(field, values[field.name]);
    if (value === undefined) continue;

    if (field.source === "query") {
      query[field.name] = Array.isArray(value) || isObject(value) ? JSON.stringify(value) : String(value);
      continue;
    }

    if (isMultipart) {
      if (value instanceof File) {
        formData.append(field.name, value);
      } else {
        formData.append(field.name, isObject(value) || Array.isArray(value) ? JSON.stringify(value) : String(value));
      }
    } else if (isFormEncoded) {
      formEncoded.append(field.name, isObject(value) || Array.isArray(value) ? JSON.stringify(value) : String(value));
    } else {
      json[field.name] = value;
    }
  }

  return {
    data: isMultipart ? formData : isFormEncoded ? formEncoded : json,
    params: query,
  };
}

function extractRows(data) {
  if (Array.isArray(data)) return data;
  if (!isObject(data)) return [];

  for (const key of ["items", "results", "records", "rows", "employees", "departments", "data"]) {
    if (Array.isArray(data[key])) return data[key];
  }

  return [];
}

function displayValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(", ") : "None";

  if (isObject(value)) {
    const label = value.full_name ?? value.name ?? value.title ?? value.label;
    if (label !== undefined) return String(label);
    const json = JSON.stringify(value);
    return json.length > 160 ? `${json.slice(0, 157)}...` : json;
  }

  return String(value);
}

function getRecordId(record, parameterName = "id") {
  if (!record) return undefined;
  if (record[parameterName] !== undefined) return record[parameterName];
  if (parameterName === "id" && record.id !== undefined) return record.id;

  const entityName = parameterName.replace(/_id$/, "");
  const candidates = [
    `${entityName}_id`,
    "id",
    "request_id",
    "record_id",
    "employee_id",
    "department_id",
    "shift_id",
    "leave_id",
    "payroll_id",
    "review_id",
    "task_id",
    "alert_id",
    "notification_id",
    "document_id",
    "dataset_id",
    "intervention_id",
    "policy_id",
    "user_id",
  ];

  for (const candidate of candidates) {
    if (record[candidate] !== undefined && record[candidate] !== null) {
      return record[candidate];
    }
  }

  return undefined;
}

function buildRequestPath(path, record = null) {
  let result = path;
  const placeholders = [...path.matchAll(/\{([^/{}]+)\}/g)];

  for (const match of placeholders) {
    const parameterName = match[1];
    const value = getRecordId(record, parameterName);
    if (value === undefined || value === null || value === "") {
      throw new Error(`Cannot determine ${parameterName} for this action.`);
    }
    result = result.replace(match[0], encodeURIComponent(String(value)));
  }

  const prefix = getApiPrefix();
  return result.startsWith(`${prefix}/`) || result === prefix
    ? result.slice(prefix.length) || "/"
    : result;
}

function getErrorText(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((entry) => entry.msg || entry.message || JSON.stringify(entry)).join("; ");
  }
  if (typeof error?.response?.data?.message === "string") return error.response.data.message;
  return error?.message || fallback;
}

function downloadBlob(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

function FieldInput({ field, value, onChange }) {
  const { schema } = field;
  const commonClass = "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400";
  const inputId = `field-${field.source}-${field.name}`;

  if (schema.enum?.length) {
    return (
      <select id={inputId} className={commonClass} value={value ?? ""} required={field.required} onChange={(event) => onChange(event.target.value)}>
        {!field.required && <option value="">Not specified</option>}
        {schema.enum.map((item) => (
          <option key={String(item)} value={String(item)}>{String(item)}</option>
        ))}
      </select>
    );
  }

  if (schema.type === "boolean") {
    return (
      <label htmlFor={inputId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-slate-200">
        <input id={inputId} type="checkbox" checked={value === true || value === "true" || value === 1} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
        {value === true || value === "true" || value === 1 ? "Enabled" : "Disabled"}
      </label>
    );
  }

  if (schema.format === "binary") {
    return (
      <input id={inputId} type="file" required={field.required} onChange={(event) => onChange(event.target.files?.[0] || null)} className={`${commonClass} file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950`} />
    );
  }

  if (schema.type === "array" || schema.type === "object") {
    return (
      <textarea id={inputId} rows={4} required={field.required} value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={schema.type === "array" ? 'Enter a JSON array, e.g. ["item1", "item2"]' : 'Enter a JSON object, e.g. {"key": "value"}'} className={commonClass} />
    );
  }

  let inputType = "text";
  if (schema.format === "email") inputType = "email";
  else if (schema.format === "date") inputType = "date";
  else if (schema.format === "date-time") inputType = "datetime-local";
  else if (schema.type === "integer" || schema.type === "number") inputType = "number";

  return (
    <input
      id={inputId}
      type={inputType}
      required={field.required}
      minLength={schema.minLength}
      maxLength={schema.maxLength}
      min={schema.minimum}
      max={schema.maximum}
      step={schema.type === "integer" ? "1" : "any"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.label}
      className={commonClass}
    />
  );
}

export default function ModulePage({
  title,
  endpoint,
  description,
  topActions = [],
  rowActions = [],
  deleteLabel = "Delete",
}) {
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [spec, setSpec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState(null);

  const prefix = getApiPrefix();
  const basePath = collectionPath(endpoint);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [dataResult, specResult] = await Promise.allSettled([
        api.get(endpoint),
        api.get(new URL("/openapi.json", api.defaults.baseURL).toString()),
      ]);

      if (dataResult.status === "rejected") throw dataResult.reason;

      const data = dataResult.value.data;
      const rows = extractRows(data);
      setRecords(rows);
      setTotalRecords(typeof data?.total === "number" ? data.total : rows.length);

      if (specResult.status === "fulfilled") {
        setSpec(specResult.value.data);
      } else {
        setSpec(null);
        setError("Records loaded, but API metadata could not be read. Create/Edit/Action forms may be unavailable.");
      }
    } catch (requestError) {
      setRecords([]);
      setTotalRecords(0);
      setError(getErrorText(requestError, "Could not load records. Check your access permissions and backend."));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    // Intentional: load records and OpenAPI metadata on module entry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const basePost = getOperationInfo(spec, basePath, "POST");

  const itemPath = spec?.paths
    ? Object.keys(spec.paths).find((path) => {
        if (!normalizePath(path).startsWith(`${basePath}/`)) return false;
        const remainder = normalizePath(path).slice(basePath.length);
        return /^\/\{[^/]+\}$/.test(remainder);
      }) ?? null
    : null;

  const itemMethods = itemPath ? spec.paths[itemPath] : null;
  const itemUpdateInfo = itemMethods?.patch
    ? getOperationInfo(spec, itemPath, "PATCH")
    : itemMethods?.put
      ? getOperationInfo(spec, itemPath, "PUT")
      : null;
  const deleteInfo = itemMethods?.delete
    ? getOperationInfo(spec, itemPath, "DELETE")
    : null;

  function fieldsFor(info) {
    return getFields(info, spec?.components?.schemas);
  }

  function openDialog(kind, info, record = null, action = null) {
    if (!info) {
      setError("This operation is not available in the backend API schema.");
      return;
    }

    const fields = fieldsFor(info);
    if (fields.length === 0) {
      setError(`${action?.label || title} does not declare any form fields in OpenAPI. Check this backend operation before submitting.`);
      return;
    }

    setDialog({ kind, info, record, action, fields });
    setFormValues(getInitialValues(fields, record));
    setError("");
    setNotice("");
  }

  function openCreate() {
    if (!basePost || (!basePost.bodySchema && !basePost.parameters?.some((parameter) => parameter.in === "query" && parameter.required))) {
      setError("This module does not expose a create form in the API schema.");
      return;
    }
    openDialog("create", basePost);
  }

  function openEdit(record) {
    if (!itemUpdateInfo) {
      setError("This module does not expose an update operation in the API schema.");
      return;
    }
    openDialog("edit", itemUpdateInfo, record);
  }

  async function refreshAndNotify(message) {
    setDialog(null);
    setNotice(message);
    await loadData();
  }

  async function submitDialog(event) {
    event.preventDefault();
    if (!dialog) return;

    setSubmitting(true);
    setError("");

    try {
      const { data, params } = makeRequestData(formValues, dialog.fields, dialog.info.mediaType);
      const url = buildRequestPath(dialog.info.path, dialog.record);
      const response = await api.request({
        method: dialog.info.method,
        url,
        data: dialog.info.method === "GET" || dialog.info.method === "DELETE" ? undefined : data,
        params,
        responseType: dialog.action?.download ? "blob" : "json",
      });

      if (dialog.action?.download) {
        downloadBlob(response.data, dialog.action.filename || `${title.toLowerCase().replace(/\s+/g, "-")}-${dialog.record?.id || "download"}`);
        await refreshAndNotify(dialog.action.successMessage || "Download started.");
      } else {
        await refreshAndNotify(
          dialog.action?.successMessage ||
            (dialog.kind === "create"
              ? `${title} record created successfully.`
              : dialog.kind === "edit"
                ? `${title} record updated successfully.`
                : `${dialog.action?.label || "Action"} completed successfully.`)
        );
      }
    } catch (requestError) {
      setError(getErrorText(requestError, "The operation could not be completed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function executeAction(action, record = null) {
    const candidate = `${prefix}${action.path}`;
    const info = getOperationInfo(spec, candidate, action.method);

    if (!info) {
      setError(`${action.label} is not available in the current backend API schema.`);
      return;
    }

    const hasFormInputs = Boolean(info.bodySchema) || (info.parameters || []).some(
      (parameter) => parameter.in === "query" && parameter.required
    );

    if (hasFormInputs) {
      openDialog("action", info, record, action);
      return;
    }

    if (action.confirm && !window.confirm(action.confirmMessage || `Continue: ${action.label}?`)) return;

    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      const url = buildRequestPath(info.path, record);
      const response = await api.request({
        method: info.method,
        url,
        responseType: action.download ? "blob" : "json",
      });

      if (action.download) {
        downloadBlob(response.data, action.filename || `${title.toLowerCase().replace(/\s+/g, "-")}-${record?.id || "download"}`);
      }

      await refreshAndNotify(action.successMessage || `${action.label} completed successfully.`);
    } catch (requestError) {
      setError(getErrorText(requestError, `${action.label} failed.`));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteRecord(record) {
    if (!deleteInfo) return;

    const recordName = record.full_name || record.name || record.title || record.email || `record #${getRecordId(record) ?? "?"}`;
    const message = `Are you sure you want to ${deleteLabel.toLowerCase()} ${recordName}?`;
    if (!window.confirm(message)) return;

    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      const response = await api.request({
        method: "DELETE",
        url: buildRequestPath(deleteInfo.path, record),
      });

      await loadData();
      setNotice(response.data?.message || `${title} ${deleteLabel.toLowerCase()} completed successfully.`);
    } catch (requestError) {
      setError(getErrorText(requestError, `Unable to ${deleteLabel.toLowerCase()} this record.`));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredRecords = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => JSON.stringify(record).toLowerCase().includes(needle));
  }, [records, filter]);

  const columns = useMemo(() => [
    ...new Set(
      filteredRecords.slice(0, 20).flatMap((record) => Object.keys(record || {}))
    ),
  ].filter((key) => !SECRET_FIELD_NAMES.has(key.toLowerCase())).slice(0, 8), [filteredRecords]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-cyan-300">WORKFORCE MANAGEMENT</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {topActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => executeAction(action)}
              disabled={!spec || submitting || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:opacity-50"
            >
              {action.download ? <Download size={15} /> : <Zap size={15} />}
              {action.label}
            </button>
          ))}

          {basePost && (
            <button
              type="button"
              onClick={openCreate}
              disabled={!spec || submitting || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
            >
              <FilePlus2 size={16} /> Create new
            </button>
          )}

          <button
            type="button"
            onClick={loadData}
            disabled={loading || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </section>

      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <span className="flex-1 break-words">{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="text-emerald-300" aria-label="Dismiss message"><X size={16} /></button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <span className="flex-1 break-words">{String(error)}</span>
          <button type="button" onClick={() => setError("")} className="text-rose-300" aria-label="Dismiss error"><X size={16} /></button>
        </div>
      )}

      <section className="rounded-2xl border border-white/[0.08] bg-slate-900/70">
        <div className="flex flex-col justify-between gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:px-5">
          <div>
            <p className="text-sm font-bold text-white">{title} records</p>
            <p className="mt-1 text-xs text-slate-400">
              {loading ? "Loading records..." : `${filteredRecords.length.toLocaleString()} shown from ${records.length.toLocaleString()} loaded · ${totalRecords.toLocaleString()} total reported by API`}
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter loaded records..."
              aria-label={`Filter ${title} records`}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-9 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
            />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-slate-300">
            <RefreshCw size={17} className="animate-spin" /> Loading {title.toLowerCase()}...
          </div>
        )}

        {!loading && !error && filteredRecords.length === 0 && (
          <div className="p-12 text-center">
            <Eye className="mx-auto text-slate-500" size={25} />
            <p className="mt-3 text-sm font-semibold text-slate-200">
              {records.length === 0 ? `No ${title.toLowerCase()} records were returned.` : "No records match your filter."}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {records.length === 0 && basePost ? "Use Create new to add the first record." : "Refresh the data or change your search."}
            </p>
          </div>
        )}

        {!loading && filteredRecords.length > 0 && (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-white/[0.035] text-slate-300">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-300">
                      {humanize(column)}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-300">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.08]">
                {filteredRecords.map((record, index) => (
                  <tr key={getRecordId(record) ?? index} className="transition hover:bg-white/[0.04]">
                    {columns.map((column) => (
                      <td key={column} className="max-w-xs px-5 py-4 text-slate-200">
                        <span className="block max-w-[260px] truncate" title={displayValue(record[column])}>
                          {displayValue(record[column])}
                        </span>
                      </td>
                    ))}

                    <td className="px-5 py-4">
                      <div className="flex min-w-max flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setDetailsRecord(record)} title="View details" className="rounded-lg border border-white/15 p-2 text-slate-300 hover:border-white/30 hover:text-white">
                          <Eye size={15} />
                        </button>

                        {itemUpdateInfo && (
                          <button type="button" onClick={() => openEdit(record)} title="Edit record" className="rounded-lg border border-cyan-300/25 p-2 text-cyan-200 hover:bg-cyan-300/10">
                            <Pencil size={15} />
                          </button>
                        )}

                        {deleteInfo && (
                          <button type="button" onClick={() => deleteRecord(record)} title={deleteLabel} disabled={submitting} className="rounded-lg border border-rose-300/25 p-2 text-rose-200 hover:bg-rose-300/10 disabled:opacity-50">
                            <Trash2 size={15} />
                          </button>
                        )}

                        {rowActions.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => executeAction(action, record)}
                            title={action.label}
                            disabled={!spec || submitting}
                            className="rounded-lg border border-white/15 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-300/40 hover:text-cyan-100 disabled:opacity-50"
                          >
                            {action.download && <Download size={13} className="mr-1 inline" />}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailsRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsRecord(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="module-details-heading" className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 id="module-details-heading" className="text-lg font-bold text-white">{title} details</h2>
              <button type="button" onClick={() => setDetailsRecord(null)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close details"><X size={18} /></button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Object.entries(detailsRecord)
                .filter(([key]) => !SECRET_FIELD_NAMES.has(key.toLowerCase()))
                .map(([key, value]) => (
                  <div key={key} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{humanize(key)}</p>
                    <p className="mt-2 break-words text-sm text-slate-100">{displayValue(value)}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setDialog(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="module-form-heading" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-wide text-cyan-300">
                  {dialog.kind === "create" ? "CREATE RECORD" : dialog.kind === "edit" ? "EDIT RECORD" : "WORKFLOW ACTION"}
                </p>
                <h2 id="module-form-heading" className="mt-2 text-xl font-bold text-white">
                  {dialog.kind === "create" ? `Create ${title}` : dialog.kind === "edit" ? `Edit ${title}` : dialog.action?.label || "Complete action"}
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Fields are generated from the backend OpenAPI schema.
                </p>
              </div>

              <button type="button" onClick={() => setDialog(null)} disabled={submitting} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50" aria-label="Close form"><X size={18} /></button>
            </div>

            {dialog.fields.length === 0 ? (
              <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4 text-sm text-amber-100">
                This operation does not expose editable request fields in the OpenAPI schema. No request has been sent.
              </div>
            ) : (
              <form onSubmit={submitDialog} className="mt-6 space-y-4">
                {dialog.fields.map((field) => (
                  <div key={`${field.source}-${field.name}`}>
                    <label htmlFor={`field-${field.source}-${field.name}`} className="mb-2 block text-sm font-bold text-slate-100">
                      {field.label}{field.required && <span className="ml-1 text-rose-300">*</span>}
                      {field.source === "query" && <span className="ml-2 text-xs font-normal text-slate-400">Query parameter</span>}
                    </label>
                    <FieldInput
                      field={field}
                      value={formValues[field.name]}
                      onChange={(value) => setFormValues((current) => ({ ...current, [field.name]: value }))}
                    />
                    {field.schema.description || field.description ? (
                      <p className="mt-1 text-xs text-slate-400">{field.schema.description || field.description}</p>
                    ) : null}
                  </div>
                ))}

                <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setDialog(null)} disabled={submitting} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
                    {submitting && <RefreshCw size={15} className="animate-spin" />}
                    {submitting ? "Saving..." : dialog.kind === "create" ? "Create record" : dialog.kind === "edit" ? "Save changes" : `Run ${dialog.action?.label || "action"}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
