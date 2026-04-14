'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Send, Volume2, WifiOff } from 'lucide-react';

import { ApiError, api, type ChatMessage } from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

type ChatBubble = ChatMessage & {
  audioUrl?: string | null;
};

const SUGGESTIONS = [
  'Oi!',
  'Como se diz azul em ingles?',
  'Podemos praticar cores?',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatBubble[]>([
    {
      role: 'assistant',
      content: 'Oi! Me peça uma frase em ingles e vamos praticar juntos.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function playAudio(url: string | null | undefined, text: string) {
    await playAudioWithFallback(url ? api.getAudioUrl(url) : null, text);
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) {
      return;
    }

    const nextUserMessage: ChatBubble = { role: 'user', content: trimmed };
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, nextUserMessage]);
    setDraft('');
    setSending(true);
    setError(null);

    try {
      const response = await api.chat(trimmed, history);
      const assistantMessage: ChatBubble = {
        role: 'assistant',
        content: response.response,
        audioUrl: response.audio_url,
      };

      setMessages((current) => [...current, assistantMessage]);

      await playAudio(response.audio_url, response.response);
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel enviar a mensagem do chat.');
      setError(nextError);
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === 'user' && message.content === trimmed)));
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleSend(draft);
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Voltar
          </Link>
          <p className="kid-tag">Chat com o tutor</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr,1.2fr]">
          <section className="kid-surface border-rose-200 p-8">
            <div className="inline-flex rounded-[1.5rem] bg-rose-50 p-4">
              <Bot className="text-kid-pink" size={34} />
            </div>
            <h1 className="mt-5 text-4xl font-black text-slate-800">Converse com o tutor</h1>
            <p className="mt-4 text-xl leading-9 text-slate-600">
              Mantenha o chat curto, seguro e divertido. Peça uma frase, um significado ou uma ideia de pratica.
            </p>
            <div className="mt-8 space-y-3">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => void handleSend(suggestion)}
                  className="w-full rounded-[1.25rem] border-2 border-slate-200 bg-white px-4 py-3 text-left text-lg font-bold text-slate-700 transition hover:border-primary hover:bg-primary-light"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {error?.isUnconfigured ? (
              <div className="mt-8 rounded-[1.5rem] border-2 border-primary bg-primary-light/40 p-5">
                <div className="flex items-center gap-3 text-primary-dark">
                  <WifiOff size={26} />
                  <p className="text-xl font-black">Conecte o tutor primeiro.</p>
                </div>
                <p className="mt-3 text-lg leading-8 text-slate-600">
                  Este aparelho precisa da URL atual do backend antes de usar o chat. Abra a pagina de conexao e salve a URL HTTPS do tunnel do seu computador.
                </p>
                <Link href="/connect" className="mt-5 inline-flex font-bold uppercase tracking-[0.16em] text-primary-dark">
                  Abrir configuracao de conexao
                </Link>
              </div>
            ) : error?.isOffline ? (
              <div className="mt-8 rounded-[1.5rem] border-2 border-kid-orange bg-orange-50 p-5">
                <div className="flex items-center gap-3 text-kid-orange">
                  <WifiOff size={26} />
                  <p className="text-xl font-black">O backend esta offline agora.</p>
                </div>
                <p className="mt-3 text-lg leading-8 text-slate-600">
                  Inicie a API e o Cloudflare Tunnel no seu computador e tente de novo. Voce tambem pode abrir a pagina de conexao para ver as instrucoes.
                </p>
                <Link href="/connect" className="mt-5 inline-flex font-bold uppercase tracking-[0.16em] text-primary-dark">
                  Abrir configuracao de conexao
                </Link>
              </div>
            ) : null}
          </section>

          <section className="kid-surface border-primary/40 p-4 md:p-6">
            <div className="flex h-[65vh] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}-${message.content}`}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[1.75rem] px-5 py-4 shadow-sm ${
                        message.role === 'user'
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <p className="text-lg leading-8">{message.content}</p>
                      {message.role === 'assistant' && message.audioUrl ? (
                        <button
                          onClick={() => void playAudio(message.audioUrl, message.content)}
                          className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-sm font-bold uppercase tracking-[0.16em] text-primary-dark"
                        >
                          <Volume2 size={16} /> Ouvir
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 border-t border-slate-100 px-2 pt-4 sm:flex-row">
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-[3.5rem] flex-1 rounded-full border-2 border-slate-200 bg-white px-5 text-lg text-slate-700 outline-none transition focus:border-primary"
                  placeholder="Peça uma frase ou diga oi..."
                  maxLength={300}
                />
                <button type="submit" disabled={sending || !draft.trim()} className="kid-button bg-primary hover:bg-primary-dark">
                  {sending ? 'Enviando...' : 'Enviar'}
                  <Send className="ml-2" size={18} />
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
