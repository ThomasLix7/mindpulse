import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { Serper } from "@langchain/community/tools/serper";
import { Tool } from "@langchain/core/tools";

export const webTools: Tool[] = [
  new Serper(process.env.SERPER_API_KEY),
  {
    name: "web-scraper",
    description: "Scrape website content",
    async call(url: string) {
      const loader = new CheerioWebBaseLoader(url);
      const docs = await loader.load();
      return docs[0].pageContent.substring(0, 5000);
    },
  } as Tool,
];
