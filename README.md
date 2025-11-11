# 🕹️ Game Control

**Game Control** é uma ferramenta web criada para apoiar treinadores durante jogos e treinos de futsal.  
Permite controlar o tempo de jogo, gerir as rotações dos atletas e monitorizar o workload de forma simples e visual.

---

## ⚙️ Funcionalidades principais

- ⏱️ **Cronómetro regressivo** com pausa, reset e intervalo  
- 🧍‍♂️ **Gestão de jogadores** com botões dinâmicos e cores (verde = em campo, vermelho = fora)  
- 🔄 **Controlo automático de rotações e tempo individual**  
- 💾 **Auto-save local** — todos os dados são guardados automaticamente  
- 📸 **Printscreen direto** com o nome das equipas e tabela  
- 🌗 **Modo escuro/claro** com alternância rápida  
- 📱 **Design responsivo**, ideal para tablets e computadores  

---

## 🧮 Variáveis registadas na tabela

| Coluna | Descrição |
|--------|------------|
| **Tempo em Campo** | Tempo total jogado pelo atleta |
| **Tempo Fora** | Tempo total no banco |
| **Rotações** | Número de entradas/saídas do jogo |
| **Média Rotação** | Duração média de cada entrada |
| **% Jogo** | Percentagem de tempo jogado |
| **Workload** | Diferença entre tempo em campo e fora (verde = positivo, vermelho = negativo) |

---

## 💡 Como usar

1. **Abre o ficheiro** `gamecontrol.html` num navegador (Chrome, Edge, Safari ou Firefox).  
2. **Edita o nome da equipa** no topo e define o tempo total do jogo (ex.: 20 minutos).  
3. **Adiciona ou remove jogadores** com os botões ➕ ou ➖ conforme o número de atletas disponíveis.  
4. **Clica na caixa do jogador** para o colocar **em campo (verde)** ou **fora (vermelho)**.  
   - O tempo é contado automaticamente em cada estado.  
   - Quando o jogador sai, aparece o tempo da **última rotação** em pequeno.  
5. Usa os botões principais para:
   - ▶️ **Iniciar** o cronómetro  
   - ⏸️ **Pausar** o tempo  
   - 🔁 **Intervalo** (reinicia o relógio para a 2.ª parte)  
   - 🔄 **Reset** (reinicia tudo)  
6. A tabela de resumo é atualizada **em tempo real**, com todas as estatísticas individuais.  
7. Clica no botão 📸 para **gerar um print automático** com o nome da equipa e a tabela final.  
8. Os dados são **guardados automaticamente** no navegador, mesmo que feches ou atualizes a página.

---

## 🧾 Créditos

Projeto desenvolvido no âmbito do treino e controlo de jogo de **Futsal de Formação**,  
com foco em monitorizar tempos de jogo, rotações e carga individual de atletas.

**Desenvolvido por:** Gonçalo Viana  

---

## 🔗 Licença

Este projeto é disponibilizado sob a **Licença MIT**, permitindo uso, modificação e partilha livre,  
desde que sejam mantidos os créditos ao autor original.  
Podes utilizá-lo em contexto pessoal, académico ou desportivo sem restrições.

