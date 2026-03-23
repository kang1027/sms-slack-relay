export const metadata = {
  title: "SMS-Slack Relay",
  description: "Android SMS Gateway ↔ Slack bidirectional relay",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
