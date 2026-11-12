import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Privacidade e dados" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" aria-label="AgroIA – início"><Logo /></Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Privacidade e uso dos dados</h1>
      <div className="prose-agro mt-4 text-[15px] text-fg/90">
        <p>Resumo de como a AgroIA trata seus dados, em linha com a Lei Geral de Proteção de Dados (LGPD):</p>
        <ul>
          <li><strong>Conta:</strong> usamos seu e-mail apenas para login e segurança da conta.</li>
          <li><strong>Conversas e fotos:</strong> ficam salvas na sua conta, acessíveis só por você. Você pode excluir cada conversa (e as fotos dela) a qualquer momento.</li>
          <li><strong>Dados da propriedade:</strong> só são enviados ao serviço de inteligência artificial se você ligar a opção de personalização no cadastro da propriedade.</li>
          <li><strong>Serviços de terceiros:</strong> as mensagens são processadas pelo provedor de IA configurado (Anthropic/Claude); a previsão do tempo vem da Open-Meteo (somente coordenadas); a transcrição e o áudio, quando habilitados, usam a ElevenLabs.</li>
          <li><strong>Localização:</strong> usada apenas para previsão do tempo, quando você pede.</li>
        </ul>
        <p>As orientações da AgroIA não substituem a avaliação de um engenheiro agrônomo ou médico-veterinário.</p>
        <p className="text-sm text-muted">O responsável pela publicação do app deve complementar esta página com seus dados de contato e encarregado (DPO).</p>
      </div>
    </div>
  );
}
