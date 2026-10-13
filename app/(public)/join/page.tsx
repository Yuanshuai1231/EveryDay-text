"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, Users } from "lucide-react";
import { BrandMark, Mascot } from "@/components/ui/Mascot";
import { requestJson } from "@/components/space/SpaceProvider";

export default function JoinPage() {
  const router = useRouter();
  useEffect(() => {
    void requestJson<{ user?: unknown }>("/api/session")
      .then((session) =>
        router.replace(session.user ? "/spaces?join=1" : "/?join=1"),
      )
      .catch(() => router.replace("/?join=1"));
  }, [router]);
  return (
    <main className="public-page join-page">
      <header className="public-header">
        <Link href="/" className="brand">
          <BrandMark />
          <span>
            叮咚小组<small>DINGDONG CLUB</small>
          </span>
        </Link>
        <Link href="/" className="text-button">
          <ArrowLeft size={16} />
          返回首页
        </Link>
      </header>
      <div className="join-main">
        <section className="join-story">
          <span className="intro-label">
            <span /> 你的小伙伴，正在等你
          </span>
          <h1>
            叮咚，
            <br />
            来和大家见面吧。
          </h1>
          <p>
            登录账号后输入邀请码，
            <br />
            无论换到哪里，都能找到你的小组。
          </p>
          <Mascot />
        </section>
        <section className="public-form-card">
          <span className="form-card-icon lavender">
            <Users size={27} />
          </span>
          <p className="eyebrow">BETTER TOGETHER</p>
          <h2>加入打卡空间</h2>
          <p className="form-card-description">
            正在前往账号登录。登录后可以加入朋友的空间。
          </p>
          <Link href="/?join=1" className="button button-primary full-width">
            登录并继续
          </Link>
        </section>
      </div>
      <footer className="public-footer">
        每一份小小的坚持，都值得被看见。
        <Heart size={13} />
      </footer>
    </main>
  );
}
