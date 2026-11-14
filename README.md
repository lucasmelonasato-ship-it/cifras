# 🎸 Minhas Cifras

App pessoal de cifras para violão. Sem anúncios, sem login, funciona offline e pode ser instalado no celular (PWA).

## O que faz
- **Biblioteca de músicas**: cole a cifra copiada de qualquer site. O app reconhece acordes, seções (`[Intro]`, `[Refrão]`), tablaturas, tom e capotraste.
- **Transposição** de tom (− / +), que fica salva por música.
- **Diagramas de acordes para violão ou ukulele**: um toque no botão 🎸/🪕 troca o instrumento, inclusive no meio do repertório. O ukulele usa a afinação padrão G-C-E-A. Toque em qualquer acorde para ampliar o desenho.
- **Batida/ritmo** por música, com teclado de setas e padrões prontos.
- **Repertórios**: escolha as músicas, ordene e toque. No **modo palco** as músicas ficam emendadas uma embaixo da outra e a página **rola sozinha**. A velocidade é ajustável e salva por música, a tela fica acesa, e dá para pausar entre músicas.
- **Afinador** pelo microfone, para violão (E A D G B E) ou ukulele (G C E A). Detecta sozinho a corda mais próxima, mostra quantos cents falta e se é para apertar ou afrouxar, e toca o som de referência de cada corda.
- **Backup** em JSON para levar a biblioteca para outro aparelho.
- **Favorito "Enviar para Minhas Cifras"** (no computador): importa a cifra da página aberta com um clique.

## Privacidade e direitos autorais
As músicas ficam **só no seu aparelho** (localStorage). O repositório contém apenas o código e 3 músicas de domínio público de exemplo.

## Rodar localmente
```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Publicar (GitHub Pages)
Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
