"use client";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <div className="m-6 rounded-2xl border border-red-200 bg-red-50 p-8" role="alert"><h2 className="font-bold text-red-800">기안 설정을 불러오지 못했어.</h2><button className="mt-4 rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white" onClick={reset} type="button">다시 시도</button></div>}
