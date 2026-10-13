import { headers } from "next/headers";
import { listLocalMail, localMailPreviewAllowed } from "@/lib/auth/local-mail";
import { isCloudAuth } from "@/lib/auth/email-auth";
import { getMailDeliveryMode } from "@/lib/auth/mail-delivery";
import { notFound } from "next/navigation";

export default async function DevMailPage() {
  const host = (await headers()).get("host") ?? "";
  if (
    !localMailPreviewAllowed(
      host,
      process.env.NODE_ENV === "production",
      isCloudAuth(),
    )
  )
    notFound();
  try {
    if (getMailDeliveryMode() !== "preview") notFound();
  } catch {
    notFound();
  }
  const mail = await listLocalMail();
  return (
    <main>
      <h1>本地测试邮件</h1>
      <p>此收件箱只在本地开发环境开放。</p>
      <ul>
        {mail.map((item) => (
          <li key={item.id}>
            <strong>{item.to}</strong>{" "}
            <time>
              {new Date(item.createdAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </time>{" "}
            {item.url ? (
              <a href={item.url}>{item.subject}</a>
            ) : (
              <strong>{item.subject}</strong>
            )}
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
