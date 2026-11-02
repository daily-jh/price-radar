import Script from 'next/script';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  await requireChatGPTUser('/');
  return <><div id="app"><main className="loading">개인 가격 관측소에 연결하고 있습니다.</main></div><dialog id="modal"/><div id="toast" role="status" aria-live="polite"/><Script src="/radar.js" strategy="afterInteractive"/></>;
}
