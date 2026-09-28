"use client";

export default function PrintButton() {
  return <button className="btn-outline" onClick={() => window.print()}>Print</button>;
}
