# FYI

FYI (Fact-check Your Information) is an interactive workbench for studying how people verify data-driven claims in news articles. Users read articles, identify quantitative claims, explore underlying datasets through AI-assisted tools and visualizations, and submit structured verdicts — while the system logs rich interaction traces for research analysis.

This codebase comprises a [Next.js](https://nextjs.org/) web application and a [Vite](https://vitejs.dev/)-based Chrome extension, both written in TypeScript.

![FYI Teaser](public/teaser.png)

## Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### API key

FYI has no key of its own. The AI features stay off until you supply one, which
you enter in the app under **API key**. It is stored in your browser and sent
with each request; the server never keeps it.

OpenRouter is the default, and any OpenAI-compatible endpoint works.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the workbench.

### Chrome Extension (Optional)

```bash
npm run build:extension
```

## Tech Stack

- **Framework:** Next.js 16, React 19, TypeScript
- **UI:** Tailwind CSS 4, Radix UI / shadcn
- **State:** Zustand 5
- **Visualization:** Vega-Lite 6, CompassQL
- **AI:** OpenRouter (Llama, GPT-4o, Perplexity Sonar)

## Project Structure

```
src/
  app/              # Next.js App Router pages and API routes
  components/       # React components
    article/        # Article viewer and claim highlighting
    claim/          # Claim list, verdict forms, classification
    tool-ai-chat/   # Chat UI with tool-augmented conversations
    tool-table/     # Dataset inspection tables
    tool-vis-builder/ # Visual encoding builder (Vega-Lite)
  lib/              # Utilities, AI clients, tracking, data loaders
  stores/           # Zustand state stores
  types/            # TypeScript type definitions
extension/          # Chrome extension for inline claim verification
```

## Credits

FYI was created by [Nguyen-Truong Thinh](https://github.com/truongthinhnguyen03)\* (HKUST), [Yuxuan Du](mailto:yuxuan.du.sherry@gmail.com)\* (Independent Contributor), [Phongsakon Mark Konrad](mailto:phkon23@student.sdu.dk) (University of Southern Denmark), and [Arpit Narechania](http://narechania.com) (HKUST).

\* Equal contribution.

## Contact

If you have any questions, feel free to [open an issue](https://github.com/DataVisards/FYI/issues/new/choose) or contact [Nguyen-Truong Thinh](mailto:truongthinh.nguyen03@gmail.com).

## License

MIT
