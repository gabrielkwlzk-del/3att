# Gestão da propriedade

Dez módulos em `/gestao`, todos por usuário (RLS), com dados que você lança ou importa. Nada é preenchido por exemplo ou estimativa escondida: quando falta dado, a tela diz o que falta.

| Módulo | O que faz | De onde vêm os números |
|---|---|---|
| **Talhões e safras** | Áreas (com cultura, estágio, plantio e água disponível no solo), safras e colheitas; produtividade por talhão | Lançamentos do produtor |
| **Financeiro** | Despesas, receitas, investimentos; resultado, margem, custo por hectare, custo por saca; comparação entre safras | Lançamentos (compras de estoque e custos de máquinas podem lançar a despesa sozinhos) |
| **Estoque** | Lotes, validade, mínimo, custo; entradas, saídas por talhão e ajustes; alertas | Lançamentos; o saldo é mantido por gatilho no banco e **não aceita ficar negativo** |
| **Máquinas** | Horímetro, consumo (L/h), custo por hora, manutenção preventiva por intervalo de horas | Lançamentos; o horímetro soma sozinho e a manutenção reinicia o ciclo |
| **Irrigação** | Registro de lâminas; necessidade de água por talhão | ET0 e chuva da Open-Meteo + coeficiente de cultura de referência |
| **Tarefas e operações** | Planejado × realizado; registro de aplicações (produto, dose usada, alvo, carência) | Lançamentos |
| **Análise de solo** | PDF do laudo → indicadores, possíveis limitações e perguntas para o agrônomo | O PDF enviado, lido pela IA |
| **Previsão de produtividade** | Faixa P10–P90 por talhão | Histórico de colheitas do próprio talhão + clima medido desde o plantio |
| **Mercado e cotações** | Histórico, variação (anterior, 7 e 30 dias), fonte, alertas | Cotações **lançadas ou coladas pelo produtor**, sempre com a fonte |
| **Relatórios** | Resumo da safra, comparação com a anterior, resumo escrito pela IA, CSV e PDF | Todos os módulos acima |

## Como cada cálculo funciona (e onde está o limite)

- **Margem de lucro** = (receita − despesas) ÷ receita. Investimentos ficam fora do resultado operacional e aparecem à parte.
- **Custo por hectare** = despesas ÷ área dos talhões que tiveram colheita **ou** lançamento na safra (sem nenhum, usa a área total). Despesas "gerais" (sem talhão) entram no total.
- **Produtividade da safra**: culturas diferentes **não se misturam**. Mostra a cultura de maior área colhida. **Custo por saca** só existe quando a safra tem uma única cultura.
- **Irrigação** (estimativa, não sensor): déficit = Σ (ET0 × Kc) − chuva efetiva − irrigação registrada, nos últimos 7 dias, supondo o solo perto da capacidade de campo no início; chuva efetiva = 80% da chuva diária a partir de 5 mm; recomenda irrigar quando o déficit passa de 50% da água disponível (a do talhão ou 50 mm assumidos, e a tela avisa). Kc: valores de referência aproximados da FAO-56 por cultura e estágio. **Sensores de solo não são integrados.**
- **Previsão de produtividade**: média e desvio das safras anteriores do talhão (mesma cultura) com intervalo de predição t de Student a 80%. Com 1 safra não há faixa; com 2 ou 3 ela é larga de propósito. O clima entra como indicadores (chuva, chuva ÷ ET0, dias ≥ 34 °C, maior veranico). A IA, se configurada, propõe um ajuste qualitativo **limitado a −30%/+15%** e justificado; sem IA, a faixa é só a do histórico. Não prevê pragas, doenças nem o clima futuro.
- **Solo**: a IA extrai e explica; **não recomenda doses** de calcário, gesso ou adubo (isso é do engenheiro agrônomo). Limite de 15 laudos a cada 30 dias por usuário. O arquivo é validado no servidor (PDF de verdade, até 10 MB) e fica em pasta privada.
- **Mercado**: a AgroIA **não busca preços sozinha**. Cada cotação tem fonte obrigatória (e link opcional). Importação em lote por colagem (`data;preço`). Alertas (acima, abaixo, variação %) são conferidos ao abrir o app; **ainda não há notificação no celular**.
- **Tarefas**: lembretes aparecem no app (atrasadas e do dia, na tela de Gestão). O registro de aplicação guarda o que foi feito; produto e dose são decisão do responsável técnico.
- **Relatórios**: o PDF é gerado pelo navegador (Imprimir → Salvar como PDF) com estilo próprio de impressão; os CSV abrem no Excel (UTF-8 com BOM, `;`, vírgula decimal, proteção contra fórmulas).

## IA e privacidade nestes módulos

Três ações enviam dados ao provedor de IA, sempre por clique do produtor e com aviso na tela: **laudo de solo** (o PDF), **estimativa de produtividade** (histórico do talhão e indicadores de clima) e **resumo do relatório** (números da safra, sem nomes de pessoas). Nenhuma delas recomenda produtos ou doses.

## Banco de dados

Migração `supabase/migrations/20261115000000_farm_management.sql` (rode depois das anteriores). Testada em Postgres local, 34 verificações: isolamento entre usuários em leitura, escrita, atualização e exclusão; recusa de referências a talhões/safras/itens de outro usuário; estoque que não fica negativo; horímetro e manutenção; restrições (tipos, valores, duplicidades) e Storage do bucket privado `soil-reports`.

## Testes

```bash
npm test      # 47 testes: cálculos (finanças, irrigação, previsão, mercado, estoque, máquinas, CSV),
              # regras de acesso das assinaturas e leitura das respostas da IA
```

As regressões que viraram teste: custo por hectare dividido só pela área colhida; média de soja com milho; sinal de menos quebrando linha.

## Ainda não existe

- Notificações no celular (tarefas, alertas de preço, manutenção).
- Integração com sensores de umidade do solo e com telemetria de máquinas.
- Cotações automáticas (precisa de um provedor de dados com contrato; a estrutura de fonte já existe).
- Acesso de equipe e várias propriedades (previsto no plano Fazenda).
- A IA do chat consultar estes dados (financeiro, estoque, tarefas) ao responder.
- Os módulos de gestão ainda **não são limitados por plano**: valem para quem tem acesso ao app.
