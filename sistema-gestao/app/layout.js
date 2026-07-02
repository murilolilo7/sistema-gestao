import "./globals.css";

export const metadata = {
  title: "Sistema de Gestão - MR7 Pré-Moldados",
  description: "Sistema de gestão de vendas, estoque e financeiro",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 text-slate-900">
        <div className="min-h-screen flex flex-col">
          <header className="bg-slate-900 text-white">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <a href="/" className="font-bold text-lg tracking-tight">
                MR7 <span className="text-emerald-400">Pré-Moldados</span>
              </a>
              <nav className="flex gap-4 text-sm">
                <a href="/produtos" className="hover:text-emerald-400 transition">
                  Produtos
                </a>
                <a href="/clientes" className="hover:text-emerald-400 transition">
                  Clientes
                </a>
                <a href="/vendas" className="hover:text-emerald-400 transition">
                  Vendas
                </a>
                <a href="/orcamentos" className="hover:text-emerald-400 transition">
                  Orçamentos
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="text-center text-xs text-slate-400 py-4">
            Sistema de Gestão MR7 · Feito com Next.js + Supabase
          </footer>
        </div>
      </body>
    </html>
  );
}
