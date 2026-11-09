"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Imagem da obra (perspectiva da folha de compatibilização): fica num bucket
// privado, e não na tabela, porque a lista de orçamentos lê todas as colunas.
export const BUCKET_IMAGENS = "orcamentos-imagens";

const LADO_MAXIMO = 1800;

async function comprimirImagem(arquivo) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolver, rejeitar) =>
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rejeitar(new Error("Não foi possível ler a imagem."))),
      "image/jpeg",
      0.85
    )
  );
}

// Devolve o caminho salvo, para gravar no orçamento.
export async function enviarImagemProjeto(arquivo) {
  const blob = await comprimirImagem(arquivo);
  const caminho = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET_IMAGENS)
    .upload(caminho, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return caminho;
}

// Endereço temporário da imagem para mostrar na tela e no impresso.
export function useUrlImagemProjeto(caminho) {
  const [estado, setEstado] = useState({ caminho: null, url: null });
  useEffect(() => {
    if (!caminho) return undefined;
    let ativo = true;
    supabase.storage
      .from(BUCKET_IMAGENS)
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => {
        if (ativo) setEstado({ caminho, url: data?.signedUrl || null });
      });
    return () => {
      ativo = false;
    };
  }, [caminho]);
  return estado.caminho === caminho ? estado.url : null;
}
