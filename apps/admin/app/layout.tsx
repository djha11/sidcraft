import type { ReactNode } from "react";
import "./styles.css";
export const metadata = {
  title: "SidCraft Admin",
  description: "Trust and operations console",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
