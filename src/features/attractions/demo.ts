import type { Place } from './api';
// UI-only reference examples. Never seeded into the database or marked verified.
export const demoPlaces: Place[] = [
  {
    id: 'demo-tianducheng', name: 'Тяньдучэн', original: 'Париж, Франция', city: 'Ханчжоу',
    category: 'landmark-replica', latitude: 30.38972, longitude: 120.24222,
    description: 'Район с собственной Эйфелевой башней, парижскими фасадами и садами, вдохновлёнными Версалем.',
    image: '/images/tianducheng.jpg', imageCredit: 'MNXANL · CC BY-SA 4.0', source: 'https://en.wikipedia.org/wiki/Tianducheng',
    imageSource: 'https://commons.wikimedia.org/wiki/File:201806_Tianducheng_Bird-eye_View.jpg', demo: true,
  },
  {
    id: 'demo-thames', name: 'Thames Town', original: 'Английский город', city: 'Шанхай',
    category: 'themed-town', latitude: 31.036, longitude: 121.1905,
    description: 'Кирпичные дома, мощёные улицы и английская архитектура в шанхайском районе Сунцзян.',
    image: '/images/thames.jpg', imageCredit: 'Huai-Chun Hsu · CC BY 2.0', source: 'https://en.wikipedia.org/wiki/Thames_Town',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Thames_Town_in_Songjiang.jpg', demo: true,
  },
  {
    id: 'demo-window', name: 'Окно в мир', original: 'Достопримечательности мира', city: 'Шэньчжэнь',
    category: 'theme-park', latitude: 22.5375139, longitude: 113.9697556,
    description: 'Тематический парк с миниатюрами известных архитектурных памятников разных стран.',
    image: '/images/window.jpg', imageCredit: 'Dinkun Chen · CC BY-SA 4.0', source: 'https://en.wikipedia.org/wiki/Window_of_the_World',
    imageSource: 'https://commons.wikimedia.org/wiki/File:WINDOWS_OF_THE_WORLD_SHENZHEN_(13).jpg', demo: true,
  },
];
