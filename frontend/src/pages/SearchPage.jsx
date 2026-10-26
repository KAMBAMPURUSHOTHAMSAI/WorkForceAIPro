import { useState } from "react";
import { Search, RefreshCw } from "lucide-react";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const searchableEntities = [
  "employees",
  "departments",
  "shifts",
  "tasks",
  "leaves",
  "reviews",
];

function humanize(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SearchPage() {
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([
    "employees",
    "departments",
    "shifts",
  ]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(event) {
    event.preventDefault();

    if (query.trim().length < 2 || selected.length === 0) {
      setError("Enter at least 2 characters and select an entity.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.get("/search", {
        params: {
          q: query.trim(),
          entities: selected.join(","),
          limit_per_type: 10,
        },
      });

      setResults(response.data.results || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Search failed. Please try again."
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleEntity(entity) {
    setSelected((current) =>
      current.includes(entity)
        ? current.filter((item) => item !== entity)
        : [...current, entity]
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-medium tracking-[0.14em] text-cyan-300">
          WORKFORCE DISCOVERY
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Advanced Search</h2>
        <p className="mt-2 text-sm text-slate-400">
          Search across your permitted workforce records.
        </p>
      </section>

      <form
        onSubmit={handleSearch}
        className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 sm:p-6"
      >
        <label
          htmlFor="search-query"
          className="block text-xs font-medium text-slate-300"
        >
          Search query
        </label>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="search-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            minLength={2}
            maxLength={120}
            placeholder="Search employees, departments, shifts..."
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : (
              <Search size={16} />
            )}
            Search
          </button>
        </div>

        <p className="mt-5 text-xs font-medium text-slate-400">
          Search within
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {searchableEntities.map((entity) => {
            const checked = selected.includes(entity);

            return (
              <button
                key={entity}
                type="button"
                onClick={() => toggleEntity(entity)}
                className={`rounded-full border px-3 py-2 text-xs transition ${
                  checked
                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
                    : "border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                {humanize(entity)}
              </button>
            );
          })}
        </div>

        {user?.role === "ADMIN" && (
          <p className="mt-3 text-[11px] text-slate-500">
            User directory administration is available in User Management.
          </p>
        )}

        {error && (
          <p className="mt-4 text-sm text-rose-300">{String(error)}</p>
        )}
      </form>

      <section className="space-y-3">
        {results.map((result) => (
          <article
            key={`${result.entity_type}-${result.id}`}
            className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  {result.label}
                </h3>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-cyan-300">
                  {humanize(result.entity_type)} · ID {result.id}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">
                Match
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(result.fields || {}).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl bg-white/[0.03] p-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    {humanize(key)}
                  </p>
                  <p className="mt-1 break-words text-sm text-slate-200">
                    {value === null || value === undefined
                      ? "—"
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}

        {!loading && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <Search className="mx-auto text-slate-600" size={25} />
            <p className="mt-3 text-sm text-slate-400">
              Search results will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}