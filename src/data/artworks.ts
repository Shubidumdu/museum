import type { Language } from "../utils/i18n.ts";

export interface LocalizedText {
  ko: string;
  en: string;
}

export interface ArtworkCredit {
  assetName?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  text?: string;
}

export interface Artwork {
  id: string;
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  credits?: ArtworkCredit[];
  previewImage?: string;
  previewVideo?: string;
}

export const ARTWORKS: Artwork[] = [
  {
    id: "place-of-refuge",
    slug: "place-of-refuge",
    title: {
      ko: "피난처",
      en: "Place of Refuge",
    },
    description: {
      ko: `끊임없는 흐름에 휩쓸리다 보면, 깊이 사유하고 온전히 숨 쉴 수 있는 틈조차 잃어버리곤 한다.
하찮고 보잘것없지만, 꿈을 품을 수 있는 이 작은 안식처가 존재한다는 것만으로도 얼마나 소중한지 모른다.`,
      en: `Swept away by the relentless tide, we often lose even the quiet room to pause and breathe.
Yet, humble and modest as it may be, having this small haven to hold my dreams is profoundly precious.`,
    },
    previewImage: "/artworks/place-of-refuge/preview.png",
    previewVideo: "/artworks/place-of-refuge/preview.mp4",
    credits: [
      {
        assetName: "3D Model",
        sourceTitle: "Old Bed",
        author: "donnichols",
        license: "CC BY 4.0",
        sourceUrl:
          "https://sketchfab.com/3d-models/old-bed-210be84bcb5449f5a9f66a923c8ae307",
      },
    ],
  },
];

export function getArtworkTitle(artwork: Artwork, lang: Language): string {
  return artwork.title[lang];
}

export function getArtworkDescription(
  artwork: Artwork,
  lang: Language,
): string {
  return artwork.description[lang];
}
