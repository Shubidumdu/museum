export interface Artwork {
  id: string;
  slug: string;
  title: string;
  description: string;
}

export const ARTWORKS: Artwork[] = [
  {
    id: "celestial-waves",
    slug: "celestial-waves",
    title: "Celestial Waves",
    description:
      "수학적 사인파와 진폭의 융합으로 태어난 유기적 파동. 마우스의 궤적에 반응하여 시시각각 빛의 파동과 리본이 겹쳐지며 우주적 질서를 시각화합니다.",
  },
];
