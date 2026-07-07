"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

const grupos = [
  {
    id: "cadastros",
    title: "Cadastros",
    desc: "Clientes e produtos",
    color: "bg-sky-600",
    itens: [
      { href: "/clientes", title: "Clientes", desc: "Cadastro de clientes" },
      { href: "/produtos", title: "Produtos", desc: "Cadastro e controle de estoque" },
    ],
  },
  {
    id: "vendas",
    title: "Vendas e Orçamentos",
    desc: "Vendas realizadas e propostas para clientes",
    color: "bg-amber-600",
    itens: [
      { href: "/vendas", title: "Vendas", desc: "Registro de vendas realizadas" },
      { href: "/orcamentos", title: "Orçamentos", desc: "Propostas enviadas a clientes" },
      {
        href: "/orcamentos-galpao",
        title: "Orçamentos Galpão",
        desc: "Levantamento de peças pré-moldadas para galpões",
      },
    ],
  },
];

export default function Home() {
  const [aberto, setAberto] = useState(null);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Painel principal</h1>
      <p className="text-slate-500 mb-8">
        Escolha um módulo abaixo para começar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {grupos.map((g) => {
          const expandido = aberto === g.id;
          return (
            <div
              key={g.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setAberto(expandido ? null : g.id)}
                className="w-full p-5 flex items-start gap-4 hover:bg-slate-50 transition text-left"
              >
                <div className={`${g.color} w-2 self-stretch rounded-full`} />
                <div className="flex-1">
                  <h2 className="font-semibold text-lg">{g.title}</h2>
                  <p className="text-sm text-slate-500">{g.desc}</p>
                </div>
                <div className="text-slate-400 mt-1">
                  {expandido ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </button>
              {expandido && (
                <div className="border-t border-slate-100">
                  {g.itens.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block px-5 py-3 hover:bg-slate-50 transition border-b border-slate-50 last:border-b-0"
                    >
                      <p className="font-medium text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
