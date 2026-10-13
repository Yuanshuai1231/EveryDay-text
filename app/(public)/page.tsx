"use client";

import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  CheckCheck,
  Heart,
  MessageCircle,
  Users,
} from "lucide-react";
import { BrandMark, Mascot } from "@/components/ui/Mascot";
import { AccountPanel } from "@/components/account/AccountPanel";

export default function PublicHomePage() {
  return (
    <main className="public-page">
      <header className="public-header">
        <Link href="/" className="brand">
          <BrandMark />
          <span>
            叮咚小组<small>DINGDONG CLUB</small>
          </span>
        </Link>
        <Link href="/join" className="button button-secondary">
          加入空间 <ArrowRight size={16} />
        </Link>
      </header>
      <div className="public-main">
        <section className="public-story">
          <span className="intro-label">
            <span /> 把坚持，变成一件开心的小事
          </span>
          <h1>
            今天也要，
            <br />
            <span>一起好好长大。</span>
          </h1>
          <p className="public-description">
            一个属于你们的温暖小空间。
            <br />
            记录每天的进步，分享琐碎的日常，
            <br />
            让每一份努力，都有人回应。
          </p>
          <div className="public-illustration">
            <div className="illustration-orbit" />
            <span className="floating-note note-left">
              <CheckCheck size={18} />
              今天又进步了一点
            </span>
            <Mascot />
            <span className="floating-note note-right">
              <Heart size={17} />
              有你一起，真好
            </span>
          </div>
          <div className="public-features">
            <span>
              <CheckCheck size={17} />
              轻松打卡
            </span>
            <span>
              <Users size={17} />
              小组陪伴
            </span>
            <span>
              <MessageCircle size={17} />
              随时聊聊
            </span>
          </div>
        </section>
        <Suspense
          fallback={<section className="public-form-card" aria-busy="true" />}
        >
          <AccountPanel />
        </Suspense>
      </div>
      <footer className="public-footer">
        <span>叮咚小组</span> · 每一份小小的坚持，都值得被看见。
        <Heart size={13} />
      </footer>
    </main>
  );
}
