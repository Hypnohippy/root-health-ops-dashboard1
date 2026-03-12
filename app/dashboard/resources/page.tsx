"use client";

import React, { useEffect, useState } from "react";

type Resource = {
  id: string;
  title: string;
  resource_type: string;
  content: any;
  created_at: string;
};

export default function ResourcesPage() {

  const [organisationId,setOrganisationId] = useState<string | null>(null);
  const [resources,setResources] = useState<Resource[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string | null>(null);

  async function loadOrganisation(){

    try{

      const res = await fetch("/api/social-accounts",{cache:"no-store"});
      const data = await res.json();

      if(!res.ok || !data?.organisationId){
        throw new Error(data?.error || "Failed to load organisation");
      }

      setOrganisationId(data.organisationId);
      return data.organisationId;

    }catch(e:any){

      setError(e?.message || "Failed to load organisation");
      return null;

    }

  }

  async function loadResources(orgId?:string){

    const id = orgId || organisationId;

    if(!id) return;

    setLoading(true);

    try{

      const res = await fetch(`/api/resource-library?organisationId=${id}`,{
        cache:"no-store"
      });

      const data = await res.json();

      if(!res.ok){
        throw new Error(data?.error || "Failed to load resources");
      }

      setResources(data.resources || []);

    }catch(e:any){

      setError(e?.message || "Failed to load resources");

    }finally{

      setLoading(false);

    }

  }

  useEffect(()=>{

    async function init(){

      const org = await loadOrganisation();

      if(org){
        loadResources(org);
      }

    }

    init();

  },[]);

  return (

  <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">

    <div className="w-full max-w-6xl space-y-6">

      <header>

        <h1 className="text-2xl font-semibold">
          Resource Library
        </h1>

        <p className="text-sm text-slate-400 mt-1">
          Your saved guides, presentations, webinars and future resources.
        </p>

      </header>

      {loading && (
        <div className="text-sm text-slate-400">
          Loading resources...
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && resources.length === 0 && (
        <div className="text-sm text-slate-400">
          No resources saved yet.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">

        {resources.map((r)=>(
          <div
          key={r.id}
          className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-2"
          >

            <div className="flex justify-between">

              <div className="font-semibold">
                {r.title}
              </div>

              <div className="text-xs text-slate-400">
                {r.resource_type}
              </div>

            </div>

            <div className="text-xs text-slate-500">
              Created {new Date(r.created_at).toLocaleString()}
            </div>

          </div>
        ))}

      </div>

    </div>

  </div>

  );

}
