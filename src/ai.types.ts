export interface MediaAsset {
  type: string;
  description: string;
  usage: string;
}

export interface ContentAssetGenerationResult {
  lessonContent: string[];
  videoScripts: string[];
  facilitatorGuides: string[];
  participantWorkbooks: string[];
  knowledgeBaseArticles: string[];
  mediaAssets: MediaAsset[];
}
