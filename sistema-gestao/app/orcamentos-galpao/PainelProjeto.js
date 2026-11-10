"use client";

import { useMemo, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { notificar } from "@/components/Ui";
import { enviarImagemProjeto, useUrlImagemProjeto } from "./imagem-projeto";
import { precoTesouraPorTamanho } from "./calculos";
import {
  lajeDoProjeto,
  pilarDoProjeto,
  resumoProjeto,
  telhaDoProjeto,
  tercaDoProjeto,
  tesouraDoProjeto,
  travamentoDoProjeto,
  vigaDoProjeto,
} from "./projeto";

// ORÇAR POR PROJETO: os grupos seguem o quadro "Informações importantes" da
// folha de compatibilização. Cada "Adicionar" manda a peça para a lista normal
// do orçamento, onde quantidade e preço continuam editáveis.
export const PROJETO_VAZIO = {
  titulo: "",
  area_coberta: "",
  altura_texto: "",
  modulacao_texto: "",
  imagem_path: null,
};

const CAMPO =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const BOTAO =
  "w-full rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-3 py-1.5 transition sm:col-start-6";

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const decimal = (v) => String(v).replace(",", ".");

function Campo({ rotulo, children, className = "" }) {
  return (
    <div className={className}>
      <label className="mb-0.5 block whitespace-nowrap text-[11px] font-medium text-slate-600">{rotulo}</label>
      {children}
    </div>
  );
}

function Grupo({ titulo, dica, children }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="mb-1.5 text-xs font-semibold text-slate-700">
        {titulo}
        {dica && <span className="ml-1 font-normal text-slate-500">{dica}</span>}
      </p>
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-6">{children}</div>
    </div>
  );
}

function Numero({ valor, aoMudar, placeholder }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={valor}
      placeholder={placeholder}
      onChange={(e) => aoMudar(decimal(e.target.value))}
      className={CAMPO}
    />
  );
}

function enviar(resultado, aoAdicionar, limpar) {
  if (resultado.erro) {
    notificar(resultado.erro, "erro");
    return;
  }
  aoAdicionar(resultado);
  limpar();
}

const PILAR_VAZIO = { qtd: "", comprimento: "", platibanda: "", largura: "0.25", altura: "0.40", comConsolo: false, deLaje: false };

function GrupoPilares({ valorM3, aoAdicionar }) {
  const [f, setF] = useState(PILAR_VAZIO);
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  return (
    <Grupo
      titulo="Pilares"
      dica={valorM3 > 0 ? `— peça inteira, com fundação e platibanda · ${moeda(valorM3)}/m³ (Engenharia)` : "— peça inteira, com fundação e platibanda"}
    >
      <Campo rotulo="Qtd."><Numero valor={f.qtd} aoMudar={mudar("qtd")} placeholder="14" /></Campo>
      <Campo rotulo="Comprimento (m)"><Numero valor={f.comprimento} aoMudar={mudar("comprimento")} placeholder="10,50" /></Campo>
      <Campo rotulo="Platibanda (m)"><Numero valor={f.platibanda} aoMudar={mudar("platibanda")} placeholder="1,00" /></Campo>
      <Campo rotulo="Seção (m)">
        <div className="flex items-center gap-1">
          <Numero valor={f.largura} aoMudar={mudar("largura")} />
          <span className="text-xs text-slate-400">x</span>
          <Numero valor={f.altura} aoMudar={mudar("altura")} />
        </div>
      </Campo>
      <div className="flex flex-col gap-0.5 text-xs text-slate-700">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={f.comConsolo || f.deLaje}
            disabled={f.deLaje}
            onChange={(e) => mudar("comConsolo")(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Com consolo
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={f.deLaje}
            onChange={(e) => mudar("deLaje")(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Pilar de laje
        </label>
      </div>
      <button
        type="button"
        className={BOTAO}
        onClick={() => enviar(pilarDoProjeto({ ...f, valorM3 }), aoAdicionar, () => setF(PILAR_VAZIO))}
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function GrupoTesouras({ referencias, aoAdicionar }) {
  const [f, setF] = useState({ qtd: "", comprimento: "" });
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  const previa = precoTesouraPorTamanho(f.comprimento, referencias);
  return (
    <Grupo titulo="Tesouras" dica="— preço pelo tamanho, entre as tesouras de referência">
      <Campo rotulo="Qtd."><Numero valor={f.qtd} aoMudar={mudar("qtd")} placeholder="4" /></Campo>
      <Campo rotulo="Comprimento (m)"><Numero valor={f.comprimento} aoMudar={mudar("comprimento")} placeholder="13,76" /></Campo>
      <p className="col-span-2 self-center text-xs text-slate-600 sm:col-span-3">
        {previa ? (
          <>
            <b className="text-slate-800">{moeda(previa.preco)}</b> por peça
          </>
        ) : (
          <span className="text-slate-400">O preço aparece ao informar o comprimento</span>
        )}
      </p>
      <button
        type="button"
        className={BOTAO}
        onClick={() =>
          enviar(tesouraDoProjeto({ ...f, referencias }), aoAdicionar, () => setF({ qtd: "", comprimento: "" }))
        }
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function GrupoTercas({ pontos, aoAdicionar }) {
  const [f, setF] = useState({ qtd: "", comprimento: "" });
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  return (
    <Grupo titulo="Terças" dica="— uma linha para cada medida">
      <Campo rotulo="Qtd."><Numero valor={f.qtd} aoMudar={mudar("qtd")} placeholder="30" /></Campo>
      <Campo rotulo="Comprimento (m)"><Numero valor={f.comprimento} aoMudar={mudar("comprimento")} placeholder="5,00" /></Campo>
      <button
        type="button"
        className={`${BOTAO} col-span-2 sm:col-span-1`}
        onClick={() => enviar(tercaDoProjeto({ ...f, pontos }), aoAdicionar, () => setF({ qtd: "", comprimento: "" }))}
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function GrupoTravamentos({ valorM3, setValorM3, aoAdicionar }) {
  const [f, setF] = useState({ qtd: "", comprimento: "" });
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  return (
    <Grupo titulo="Vigas de travamento">
      <Campo rotulo="Qtd."><Numero valor={f.qtd} aoMudar={mudar("qtd")} placeholder="12" /></Campo>
      <Campo rotulo="Comprimento (m)"><Numero valor={f.comprimento} aoMudar={mudar("comprimento")} placeholder="5,00" /></Campo>
      <Campo rotulo="Valor do m³ (R$)"><Numero valor={valorM3} aoMudar={setValorM3} /></Campo>
      <button
        type="button"
        className={BOTAO}
        onClick={() => enviar(travamentoDoProjeto({ ...f, valorM3 }), aoAdicionar, () => setF({ qtd: "", comprimento: "" }))}
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function GrupoVigas({ valorM3, setValorM3, aproveitamento, aoAdicionar }) {
  const [f, setF] = useState({ qtd: "", comprimento: "", altura: "" });
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  return (
    <Grupo titulo="Vigas de laje" dica="— uma linha para cada medida real da viga">
      <Campo rotulo="Qtd."><Numero valor={f.qtd} aoMudar={mudar("qtd")} placeholder="4" /></Campo>
      <Campo rotulo="Comprimento (m)"><Numero valor={f.comprimento} aoMudar={mudar("comprimento")} placeholder="5,60" /></Campo>
      <Campo rotulo="Altura (m)"><Numero valor={f.altura} aoMudar={mudar("altura")} placeholder="0,60" /></Campo>
      <Campo rotulo="Valor do m³ (R$)"><Numero valor={valorM3} aoMudar={setValorM3} placeholder="R$/m³" /></Campo>
      <button
        type="button"
        className={BOTAO}
        onClick={() => {
          if (!(Number(valorM3) > 0)) {
            notificar("Informe o valor do m³ da viga.", "erro");
            return;
          }
          enviar(vigaDoProjeto({ ...f, valorM3, aproveitamento }), aoAdicionar, () =>
            setF({ qtd: "", comprimento: "", altura: "" })
          );
        }}
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function GrupoLajes({ lajes, aoAdicionar }) {
  const [f, setF] = useState({ tipoId: "", area: "", local: "" });
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  const composicao = lajes.find((l) => String(l.id) === String(f.tipoId));
  return (
    <Grupo titulo="Lajes" dica="— uma linha para cada laje">
      <Campo rotulo="Tipo" className="col-span-2">
        <select value={f.tipoId} onChange={(e) => mudar("tipoId")(e.target.value)} className={CAMPO}>
          <option value="">Selecione o tipo</option>
          {lajes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome} — {moeda(l.preco)}/m²
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Área (m²)"><Numero valor={f.area} aoMudar={mudar("area")} placeholder="287" /></Campo>
      <Campo rotulo="Local (opcional)" className="sm:col-span-2">
        <input
          type="text"
          value={f.local}
          placeholder="Castelo"
          onChange={(e) => mudar("local")(e.target.value)}
          className={CAMPO}
        />
      </Campo>
      <button
        type="button"
        className={BOTAO}
        onClick={() =>
          enviar(lajeDoProjeto({ composicao, area: f.area, local: f.local }), aoAdicionar, () =>
            setF((a) => ({ ...a, area: "", local: "" }))
          )
        }
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function GrupoTelha({ telhas, aoAdicionar }) {
  const [f, setF] = useState({ tipoId: "", area: "", perda: "10" });
  const mudar = (campo) => (v) => setF((a) => ({ ...a, [campo]: v }));
  const composicao = telhas.find((t) => String(t.id) === String(f.tipoId));
  return (
    <Grupo titulo="Telha">
      <Campo rotulo="Tipo" className="col-span-2">
        <select value={f.tipoId} onChange={(e) => mudar("tipoId")(e.target.value)} className={CAMPO}>
          <option value="">Selecione o tipo</option>
          {telhas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} — {moeda(t.preco)}/m²
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Área da coberta (m²)"><Numero valor={f.area} aoMudar={mudar("area")} placeholder="356" /></Campo>
      <Campo rotulo="Perda (%)"><Numero valor={f.perda} aoMudar={mudar("perda")} /></Campo>
      <button
        type="button"
        className={BOTAO}
        onClick={() =>
          enviar(telhaDoProjeto({ composicao, area: f.area, perda: f.perda }), aoAdicionar, () =>
            setF((a) => ({ ...a, area: "" }))
          )
        }
      >
        Adicionar
      </button>
    </Grupo>
  );
}

function ImagemDaObra({ caminho, aoMudar }) {
  const url = useUrlImagemProjeto(caminho);
  const [enviando, setEnviando] = useState(false);

  async function receber(arquivo) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      notificar("Envie uma imagem (JPG ou PNG). Para o PDF, tire um print da perspectiva.", "erro");
      return;
    }
    setEnviando(true);
    try {
      aoMudar(await enviarImagemProjeto(arquivo));
    } catch (e) {
      notificar("Não foi possível enviar a imagem: " + e.message, "erro");
    }
    setEnviando(false);
  }

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        const arquivo = [...(e.clipboardData?.files || [])][0];
        if (arquivo) {
          e.preventDefault();
          receber(arquivo);
        }
      }}
      className="rounded-lg border border-dashed border-slate-300 bg-white p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      {caminho ? (
        <div className="flex flex-wrap items-center gap-3">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt="Imagem da obra" className="max-h-28 rounded border border-slate-200" />
          ) : (
            <span className="text-xs text-slate-500">Carregando imagem…</span>
          )}
          <button
            type="button"
            onClick={() => aoMudar(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
          >
            <Trash2 size={13} /> Remover
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200">
            <ImagePlus size={15} />
            {enviando ? "Enviando…" : "Escolher imagem"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={enviando}
              onChange={(e) => {
                receber(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <span>ou clique aqui e cole um print (Ctrl+V). Sai no impresso no lugar do desenho automático.</span>
        </div>
      )}
    </div>
  );
}

export default function PainelProjeto({
  projeto,
  aoMudarProjeto,
  composicoes,
  itens,
  valorM3Armado,
  aproveitamentoViga,
  travamentoValorM3,
  setTravamentoValorM3,
  vigaValorM3,
  setVigaValorM3,
  aoAdicionar,
}) {
  const { referencias, pontosTerca, lajes, telhas } = useMemo(() => {
    const doPapel = (papel) => (composicoes || []).filter((c) => c.papel === papel);
    return {
      referencias: doPapel("TESOURA").filter((c) => Number(c.comprimento_referencia) > 0 && Number(c.preco) > 0),
      pontosTerca: doPapel("TERCA").map((c) => ({
        medida: Number(c.comprimento_referencia) || 0,
        preco: Number(c.preco) || 0,
      })),
      lajes: doPapel("LAJE"),
      telhas: doPapel("TELHA"),
    };
  }, [composicoes]);

  const r = resumoProjeto(itens);
  const fmt = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const texto = (campo) => (e) => aoMudarProjeto({ [campo]: e.target.value });

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">
        Use os números do quadro &quot;Informações importantes&quot; da folha de compatibilização. Cada peça vai para a
        lista abaixo, onde dá para ajustar. Fundação e montagem são contadas sozinhas pelas peças. Calha e capote: informe
        a quantidade na lista.
      </p>

      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
        <Campo rotulo="Nome da obra (opcional)" className="col-span-2">
          <input
            type="text"
            value={projeto.titulo}
            placeholder="Ex.: Residência multifamiliar"
            onChange={texto("titulo")}
            className={CAMPO}
          />
        </Campo>
        <Campo rotulo="Área coberta (m²)">
          <Numero valor={projeto.area_coberta} aoMudar={(v) => aoMudarProjeto({ area_coberta: v })} placeholder="356" />
        </Campo>
        <Campo rotulo="Modulação no impresso">
          <input
            type="text"
            value={projeto.modulacao_texto}
            placeholder="VARIÁVEL"
            onChange={texto("modulacao_texto")}
            className={CAMPO}
          />
        </Campo>
        <Campo rotulo="Altura no impresso" className="col-span-2 sm:col-span-4">
          <input
            type="text"
            value={projeto.altura_texto}
            placeholder="Em branco usa o pé-direito. Ex.: 8,00M + PLATIBANDA 1,00M"
            onChange={texto("altura_texto")}
            className={CAMPO}
          />
        </Campo>
      </div>

      <Campo rotulo="Imagem da obra">
        <ImagemDaObra caminho={projeto.imagem_path} aoMudar={(p) => aoMudarProjeto({ imagem_path: p })} />
      </Campo>

      <GrupoPilares valorM3={Number(valorM3Armado) || 0} aoAdicionar={aoAdicionar} />
      <GrupoTesouras referencias={referencias} aoAdicionar={aoAdicionar} />
      <GrupoTercas pontos={pontosTerca} aoAdicionar={aoAdicionar} />
      <GrupoTravamentos valorM3={travamentoValorM3} setValorM3={setTravamentoValorM3} aoAdicionar={aoAdicionar} />
      <GrupoVigas
        valorM3={vigaValorM3}
        setValorM3={setVigaValorM3}
        aproveitamento={aproveitamentoViga}
        aoAdicionar={aoAdicionar}
      />
      <GrupoLajes lajes={lajes} aoAdicionar={aoAdicionar} />
      <GrupoTelha telhas={telhas} aoAdicionar={aoAdicionar} />

      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
        <b>Lançado até agora:</b> {fmt(r.pilares)} pilares · {fmt(r.tesouras)} tesouras · {fmt(r.tercas)} terças ·{" "}
        {fmt(r.travamentos)} travamentos · {fmt(r.vigas)} vigas de laje ({fmt(r.vigasM)} m) · {fmt(r.lajeM2)} m² de laje · {fmt(r.telhaM2)} m²
        de telha
      </p>
    </div>
  );
}
