const cards = [
  {
    href: "/produtos",
    title: "Produtos",
    desc: "Cadastro e controle de estoque",
    color: "bg-emerald-600",
  },
  {
    href: "/clientes",
    title: "Clientes",
    desc: "Cadastro de clientes",
    color: "bg-sky-600",
  },
  {
    href: "/vendas",
    title: "Vendas",
    desc: "Registro de vendas realizadas",
    color: "bg-amber-600",
  },
  {
    href: "/orcamentos",
    title: "Orçamentos",
    desc: "Propostas enviadas a clientes",
    color: "bg-violet-600",
  },
];

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Painel principal</h1>
      <p className="text-slate-500 mb-8">
        Escolha um módulo abaixo para começar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <a
            key={c.href}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition flex items-start gap-4"
          >
            <div className={`${c.color} w-2 self-stretch rounded-full`} />
            <div>
              <h2 className="font-semibold text-lg">{c.title}</h2>
              <p className="text-sm text-slate-500">{c.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
