export default function ResponseAttentionBadge({count}:{count:number}) {
  if(count<1) return null;
  return <span className="ml-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white shadow-sm">
    <span aria-hidden="true">{count>1 ? count : "•"}</span><span className="sr-only">{count} {count===1 ? "response needs" : "responses need"} attention</span>
  </span>;
}
