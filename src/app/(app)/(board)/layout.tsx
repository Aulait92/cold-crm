// Pipelines nutzen die volle Bildschirmbreite
export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>;
}
