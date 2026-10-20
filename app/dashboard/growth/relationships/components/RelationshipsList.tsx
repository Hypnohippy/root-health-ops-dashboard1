"use client";

import { useEffect, useState } from "react";
import type { PrimaryRelationshipsPage } from "@/lib/relationshipDiscovery.server";
import { OpsIntelligenceCard } from "../../../components/visual/OpsSurface";
import { OverviewIcon } from "./RelationshipOverviewVisuals";
import RelationshipDiscovery from "./RelationshipDiscovery";

export default function RelationshipsList({
  organisationId,
  initial,
}: {
  organisationId: string;
  initial: PrimaryRelationshipsPage;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState("active");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (urlQuery) {
      setQ(urlQuery);
      setPage(0);
    }

    const onSearch = (event: Event) => {
      const query =
        (event as CustomEvent<{ query?: string }>).detail?.query || "";
      setQ(query);
      setPage(0);
    };

    window.addEventListener("ops-relationship-search", onSearch);
    return () =>
      window.removeEventListener("ops-relationship-search", onSearch);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/growth/relationships?${new URLSearchParams({
          organisationId,
          q,
          view,
          page: String(page),
        })}`,
        { cache: "no-store", signal: abort.signal },
      )
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) {
            throw Error(data.error || "Relationships could not be loaded.");
          }
          if (!abort.signal.aborted) {
            setResult(data);
            setError("");
          }
        })
        .catch((reason) => {
          if (!abort.signal.aborted) {
            setError(reason.message);
          }
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [organisationId, q, view, page]);

  const peopleOnPage = result.items.filter(
    (relationship) =>
      relationship.entityKind === "person" ||
      relationship.entityKind === "person_with_company",
  ).length;

  const companiesOnPage = result.items.filter(
    (relationship) => relationship.entityKind === "company",
  ).length;

  return (
    <main className="relationship-list mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-8">
      <header className="relationship-list-header relationship-list-hero">
        <div className="relationship-list-hero-copy">
          <p className="text-sm text-emerald-300">
            Growth · One relationship, shared history
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            <OverviewIcon kind="conversation" />
            Relationships
