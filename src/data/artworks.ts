export interface Artwork {
  id: string;
  slug: string;
  title: string;
  description: string;
}

export const ARTWORKS: Artwork[] = [
  {
    id: "my-own-paradise",
    slug: "my-own-paradise",
    title: "My Own Paradise",
    description:
      "BabylonJS 3D 기반의 공간 시각화. 부유하는 다면체 코어와 그 주위를 공전하는 링 및 위성들이 이루는 미니멀한 3D 가상 세계입니다.",
  },
];
