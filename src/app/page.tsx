export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>SMS-Slack Relay</h1>
      <p>Android SMS Gateway ↔ Slack 양방향 릴레이 서버가 실행 중입니다.</p>
      <p>
        <a href="/api/health">헬스체크 →</a>
      </p>
    </main>
  );
}
