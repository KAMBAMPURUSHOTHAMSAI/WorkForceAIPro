import { useState } from "react";
import {
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

import api from "../api/axios";

const reportTypes = [
  {
    label: "Employee Report",
    endpoint: "employees",
    description: "Employee directory and workforce information.",
  },
  {
    label: "Attendance Report",
    endpoint: "attendance",
    description: "Attendance records and workforce attendance data.",
  },
  {
    label: "Payroll Report",
    endpoint: "payroll",
    description: "Payroll records and payment summaries.",
  },
  {
    label: "Attrition Report",
    endpoint: "attrition",
    description: "Workforce attrition predictions and risk data.",
  },
];

const formats = [
  { value: "csv", label: "CSV", icon: FileText },
  { value: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", icon: FileBarChart },
];

export default function ReportsPage() {
  const [format, setFormat] = useState("xlsx");
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function downloadReport(report) {
    setDownloading(report.endpoint);
    setError("");
    setMessage("");

    try {
      const response = await api.get(
        `/reports/${report.endpoint}`,
        {
          params: { format },
          responseType: "blob",
        }
      );

      const contentType =
        response.headers["content-type"] ||
        "application/octet-stream";

      const blob = new Blob([response.data], {
        type: contentType,
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `${report.endpoint}-report.${format}`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);

      setMessage(`${report.label} download started.`);
    } catch (requestError) {
      if (requestError.response?.data instanceof Blob) {
        try {
          const responseText =
            await requestError.response.data.text();
          const parsed = JSON.parse(responseText);
          setError(
            parsed.detail || "Report download failed."
          );
        } catch {
          setError("Report download failed. Check API permissions.");
        }
      } else {
        setError(
          requestError.response?.data?.detail ||
            "Report download failed. Check the report API."
        );
      }
    } finally {
      setDownloading("");
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-medium tracking-[0.14em] text-cyan-300">
          ANALYTICS & EXPORTS
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          Reports center
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Export workforce information into supported file formats.
        </p>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 sm:p-6">
        <label
          htmlFor="report-format"
          className="block text-xs font-medium text-slate-300"
        >
          Export format
        </label>

        <select
          id="report-format"
          value={format}
          onChange={(event) => setFormat(event.target.value)}
          className="mt-2 w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
        >
          {formats.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200">
          {String(error)}
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {reportTypes.map((report) => (
          <article
            key={report.endpoint}
            className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 transition hover:border-cyan-300/20"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="rounded-xl bg-cyan-300/10 p-3 text-cyan-300">
                <FileBarChart size={21} />
              </div>

              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium uppercase text-slate-400">
                {format}
              </span>
            </div>

            <h3 className="mt-5 text-base font-semibold">
              {report.label}
            </h3>

            <p className="mt-2 min-h-10 text-sm leading-6 text-slate-400">
              {report.description}
            </p>

            <button
              onClick={() => downloadReport(report)}
              disabled={Boolean(downloading)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
            >
              <Download size={16} />
              {downloading === report.endpoint
                ? "Preparing report..."
                : "Download report"}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}