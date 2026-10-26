import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const DOCUMENT_TYPES = [
  { value: "GENERAL", label: "General" },
  { value: "IDENTITY", label: "Identity document" },
  { value: "OFFER_LETTER", label: "Offer letter" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "PAYSLIP", label: "Payslip" },
  { value: "OTHER", label: "Other" },
];

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PAGE_SIZE = 100;

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || String(item)).join("; ");
  }
  return error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function displayType(value) {
  const item = DOCUMENT_TYPES.find((type) => type.value === value);
  if (item) return item.label;
  return String(value || "GENERAL")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function employeeName(employee) {
  return [employee?.first_name, employee?.last_name]
    .filter(Boolean)
    .join(" ") || employee?.email || `Employee #${employee?.id}`;
}

function DocumentTypeBadge({ value }) {
  const isImage = value === "image/png" || value === "image/jpeg";
  const Icon = isImage ? FileImage : FileText;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200">
      <Icon size={14} />
      {displayType(value)}
    </span>
  );
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const role = String(user?.role || "").toUpperCase();
  const canManageAll = role === "ADMIN" || role === "HR";
  const canDelete = canManageAll;

  const [documents, setDocuments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadEmployeeId, setUploadEmployeeId] = useState("");
  const [uploadType, setUploadType] = useState("GENERAL");
  const [uploadFile, setUploadFile] = useState(null);

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [Number(employee.id), employee])),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.id, employee.employee_code, employee.first_name, employee.last_name, employee.email]
        .filter((item) => item !== undefined && item !== null)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [employees, employeeSearch]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { limit: PAGE_SIZE };
      if (selectedEmployee) params.employee_id = Number(selectedEmployee);
      if (selectedType) params.document_type = selectedType;
      const response = await api.get("/documents", { params });
      setDocuments(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to load employee documents."));
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, selectedType]);

  const loadEmployees = useCallback(async () => {
    if (!canManageAll) return;
    setEmployeesLoading(true);
    try {
      const firstResponse = await api.get("/employees", {
        params: { page: 1, page_size: PAGE_SIZE, employment_status: "ACTIVE" },
      });
      const firstPage = firstResponse.data;
      const allEmployees = Array.isArray(firstPage?.items) ? [...firstPage.items] : [];
      const total = Number(firstPage?.total || allEmployees.length);
      const pageCount = Math.ceil(total / PAGE_SIZE);

      if (pageCount > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) =>
            api.get("/employees", {
              params: {
                page: index + 2,
                page_size: PAGE_SIZE,
                employment_status: "ACTIVE",
              },
            })
          )
        );
        remainingPages.forEach((response) => {
          if (Array.isArray(response.data?.items)) {
            allEmployees.push(...response.data.items);
          }
        });
      }
      setEmployees(allEmployees);
    } catch (requestError) {
      setEmployees([]);
      setError((current) => current || errorMessage(requestError, "Could not load the employee directory."));
    } finally {
      setEmployeesLoading(false);
    }
  }, [canManageAll]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const visibleDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((document) => {
      const employee = employeeById.get(Number(document.employee_id));
      const searchable = [
        document.original_filename,
        document.document_type,
        document.content_type,
        document.employee_id,
        document.id,
        employee?.employee_code,
        employee?.first_name,
        employee?.last_name,
        employee?.email,
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [documents, employeeById, search]);

  async function handleUpload(event) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!uploadFile) {
      setError("Choose a file to upload.");
      return;
    }

    const fileName = uploadFile.name || "";
    const extension = fileName.includes(".")
      ? `.${fileName.split(".").pop().toLowerCase()}`
      : "";

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("Only PDF, PNG, JPG, and JPEG files are supported.");
      return;
    }
    if (uploadFile.size <= 0) {
      setError("The selected file is empty.");
      return;
    }
    if (uploadFile.size > MAX_FILE_SIZE) {
      setError("The file exceeds the 5 MB limit.");
      return;
    }
    if (canManageAll && !uploadEmployeeId) {
      setError("Select an active employee for this document.");
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("document_type", uploadType);
    if (canManageAll) formData.append("employee_id", String(uploadEmployeeId));

    setUploading(true);
    try {
      await api.post("/documents", formData);
      setNotice("Document uploaded successfully.");
      setUploadFile(null);
      setUploadType("GENERAL");
      setUploadEmployeeId("");
      setEmployeeSearch("");
      setShowUploadForm(false);
      const input = window.document.getElementById("employee-document-file");
      if (input) input.value = "";
      await loadDocuments();
    } catch (requestError) {
      setError(errorMessage(requestError, "Document upload failed."));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(document) {
    setDownloadingId(document.id);
    setError("");
    setNotice("");
    try {
      const response = await api.get(`/documents/${document.id}/download`, {
        responseType: "blob",
      });
      const objectUrl = window.URL.createObjectURL(
        new Blob([response.data], {
          type: document.content_type || "application/octet-stream",
        })
      );
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = document.original_filename || `document-${document.id}`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setNotice(`Downloaded ${document.original_filename}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, "Could not download this document."));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(document) {
    const confirmed = window.confirm(
      `Delete "${document.original_filename}"? This removes the stored file and marks the document as deleted.`
    );
    if (!confirmed) return;

    setDeletingId(document.id);
    setError("");
    setNotice("");
    try {
      await api.delete(`/documents/${document.id}`);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setNotice("Document deleted successfully.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Could not delete this document."));
    } finally {
      setDeletingId(null);
    }
  }

  const totalBytes = documents.reduce(
    (total, document) => total + Number(document.file_size || 0),
    0
  );

  return (
    <main className="min-h-full space-y-6 pb-10 text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/70 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              <ShieldCheck size={14} /> Secure employee files
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Employee Documents</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
              Upload, find, and download employee documents from one place. File access follows your assigned role and employee relationship.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setShowUploadForm((current) => !current);
                setError("");
                setNotice("");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {showUploadForm ? <X size={17} /> : <Upload size={17} />}
              {showUploadForm ? "Close upload" : "Upload document"}
            </button>
            <button
              type="button"
              onClick={() => {
                loadDocuments();
                loadEmployees();
              }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">{error}</div>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-lg p-1 text-rose-200 hover:bg-rose-400/10"><X size={16} /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="rounded-lg p-1 text-emerald-200 hover:bg-emerald-400/10"><X size={16} /></button>
        </div>
      )}

      {showUploadForm && (
        <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-white">Upload a document</h3>
            <p className="mt-1 text-sm text-slate-400">PDF, PNG, JPG or JPEG. Maximum file size: 5 MB.</p>
          </div>
          <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-2">
            {canManageAll && (
              <div className="md:col-span-2">
                <label htmlFor="document-employee" className="mb-2 block text-sm font-medium text-slate-200">Employee <span className="text-rose-300">*</span></label>
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3">
                  <Search size={16} className="shrink-0 text-slate-500" />
                  <input
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Search employee by name, code, email or ID"
                    className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </div>
                <select
                  id="document-employee"
                  required
                  value={uploadEmployeeId}
                  onChange={(event) => setUploadEmployeeId(event.target.value)}
                  disabled={employeesLoading}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-60"
                >
                  <option value="">{employeesLoading ? "Loading employees…" : "Select an active employee"}</option>
                  {filteredEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_code} · {employeeName(employee)} · #{employee.id}
                    </option>
                  ))}
                </select>
                {!employeesLoading && employees.length === 0 && (
                  <p className="mt-2 text-xs text-amber-200">No active employees found, or the employee directory could not be loaded.</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="document-type" className="mb-2 block text-sm font-medium text-slate-200">Document type</label>
              <select
                id="document-type"
                value={uploadType}
                onChange={(event) => setUploadType(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
              >
                {DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-500">The backend stores the selected type as uppercase text.</p>
            </div>

            <div>
              <label htmlFor="employee-document-file" className="mb-2 block text-sm font-medium text-slate-200">Choose file <span className="text-rose-300">*</span></label>
              <input
                id="employee-document-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                required
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                className="block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-200 hover:file:bg-cyan-400/20"
              />
              {uploadFile && <p className="mt-2 break-all text-xs text-slate-400">{uploadFile.name} · {formatBytes(uploadFile.size)}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 md:col-span-2">
              <p className="text-xs text-slate-500">Do not upload unsupported or sensitive files to the wrong employee profile.</p>
              <button
                type="submit"
                disabled={uploading || (canManageAll && employeesLoading)}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? "Uploading…" : "Upload securely"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between text-sm text-slate-400"><span>Loaded documents</span><FileText size={17} className="text-cyan-300" /></div>
          <p className="mt-3 text-3xl font-bold text-white">{documents.length}</p>
          <p className="mt-1 text-xs text-slate-500">Latest records returned by the API (up to {PAGE_SIZE})</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between text-sm text-slate-400"><span>Loaded file size</span><FileImage size={17} className="text-violet-300" /></div>
          <p className="mt-3 text-3xl font-bold text-white">{formatBytes(totalBytes)}</p>
          <p className="mt-1 text-xs text-slate-500">Combined size of currently loaded records</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between text-sm text-slate-400"><span>Access level</span><UserRound size={17} className="text-emerald-300" /></div>
          <p className="mt-3 text-xl font-bold text-white">{role || "USER"}</p>
          <p className="mt-1 text-xs text-slate-500">Enforced by the backend for each document action</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Document library</h3>
            <p className="mt-1 text-sm text-slate-400">Search the records you are authorized to see.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="relative block sm:col-span-1">
              <span className="sr-only">Search documents</span>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files…"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
            </label>
            {canManageAll && (
              <label className="block">
                <span className="sr-only">Filter by employee</span>
                <select
                  value={selectedEmployee}
                  onChange={(event) => setSelectedEmployee(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                >
                  <option value="">All employees</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employeeName(employee)}</option>)}
                </select>
              </label>
            )}
            <label className="relative block">
              <span className="sr-only">Filter by document type</span>
              <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400"
              >
                <option value="">All types</option>
                {DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full text-left text-sm">
            <thead className="bg-slate-950/80 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-4 font-semibold">Document</th>
                <th className="px-5 py-4 font-semibold">Employee</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Size</th>
                <th className="px-5 py-4 font-semibold">Uploaded</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Loading documents…</span></td></tr>
              ) : visibleDocuments.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-500"><FileText size={26} /></div>
                    <p className="mt-4 font-semibold text-white">No documents found</p>
                    <p className="mt-1 text-sm text-slate-400">Try changing the filters, or upload a document to get started.</p>
                  </div>
                </td></tr>
              ) : visibleDocuments.map((document) => {
                const employee = employeeById.get(Number(document.employee_id));
                const employeeLabel = employee
                  ? `${employeeName(employee)} (${employee.employee_code})`
                  : `Employee #${document.employee_id}`;
                return (
                  <tr key={document.id} className="transition hover:bg-white/[0.025]">
                    <td className="max-w-[280px] px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-cyan-200"><FileText size={18} /></div>
                        <div className="min-w-0">
                          <p title={document.original_filename} className="truncate font-medium text-white">{document.original_filename}</p>
                          <p className="mt-1 text-xs text-slate-500">Document #{document.id} · {document.content_type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{employeeLabel}</td>
                    <td className="px-5 py-4"><DocumentTypeBadge value={document.document_type} /></td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-slate-300">{formatBytes(document.file_size)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{formatDate(document.uploaded_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          title="Download document"
                          onClick={() => handleDownload(document)}
                          disabled={downloadingId === document.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
                        >
                          {downloadingId === document.id ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
                          Download
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            title="Delete document"
                            onClick={() => handleDelete(document)}
                            disabled={deletingId === document.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
                          >
                            {deletingId === document.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {visibleDocuments.length} of {documents.length} loaded documents · maximum {PAGE_SIZE} per request.</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-300" /> Download and deletion permissions are checked by the API.</span>
        </div>
      </section>
    </main>
  );
}
