"use client";
import Link from "next/link";
export default function ErrorPage({reset}:{reset:()=>void}){
 return <section className="empty-state panel"><h2>小空间暂时走神了</h2><p>请稍后重新加载，你已保存的记录会继续保留。</p><div className="button-row"><button className="button button-primary" onClick={reset}>重新加载</button><Link className="button button-secondary" href="/">回到首页</Link></div></section>;
}

