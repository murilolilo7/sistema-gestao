import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
    title: "Sistema de Gestão - MR7 Pré-Moldados",
    description: "Sistema de gestão de vendas, estoque e financeiro",
};

export default function RootLayout({ children }) {
    return (
          <html lang="pt-BR">
            <body className="bg-slate-50 text-slate-900">
              <AppShell>{children}</AppShell>
      </body>
      </html>
    );
}
