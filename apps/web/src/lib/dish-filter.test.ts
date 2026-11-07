import type { DishCard } from '@mam/db'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_DISH_FILTER,
  filterDishes,
  parseDishSearch,
  parsePrice,
  toDishFilter,
  toDishSearch,
  type DishFilter,
  type DishSearch,
} from './dish-filter'
import { parseSearch } from './search-params'

function dish(overrides: Partial<DishCard> & Pick<DishCard, 'slug'>): DishCard {
  return {
    id: overrides.slug,
    nameVi: overrides.slug,
    nameEn: overrides.slug,
    priceVnd: 30_000,
    mealTypes: ['lunch'],
    tags: [],
    region: 'any',
    prepMinutes: 10,
    fillLevel: 2,
    descVi: '',
    descEn: '',
    ...overrides,
  }
}

const DISHES: DishCard[] = [
  dish({
    slug: 'com-tam',
    nameVi: 'Cơm tấm',
    nameEn: 'Broken rice',
    priceVnd: 35_000,
    mealTypes: ['breakfast', 'lunch'],
    tags: ['rice', 'pork'],
  }),
  dish({
    slug: 'pho-bo',
    nameVi: 'Phở bò',
    nameEn: 'Beef phở',
    priceVnd: 45_000,
    mealTypes: ['breakfast', 'dinner'],
    tags: ['noodle', 'soup', 'beef'],
  }),
  dish({
    slug: 'pho-chay',
    nameVi: 'Phở chay',
    nameEn: 'Vegetarian phở',
    priceVnd: 40_000,
    mealTypes: ['breakfast'],
    tags: ['noodle', 'soup', 'vegetarian', 'quick'],
  }),
  dish({
    slug: 'banh-mi-chay',
    nameVi: 'Bánh mì chay',
    nameEn: 'Vegetarian bánh mì',
    priceVnd: 20_000,
    mealTypes: ['breakfast', 'lunch'],
    tags: ['vegetarian'],
  }),
  dish({
    slug: 'dau-hu',
    nameVi: 'Đậu hũ sốt cà',
    nameEn: 'Tofu in tomato sauce',
    priceVnd: 25_000,
    mealTypes: ['dinner'],
    tags: ['tofu', 'vegetarian', 'quick'],
  }),
  dish({
    slug: 'com-hop-van-phong',
    nameVi: 'Cơm hộp văn phòng',
    nameEn: 'Office lunch box',
    priceVnd: 35_000,
    mealTypes: ['lunch'],
    tags: ['rice'],
  }),
]

function slugsFor(filter: Partial<DishFilter>): string[] {
  return filterDishes(DISHES, { ...EMPTY_DISH_FILTER, ...filter }).map((d) => d.slug)
}

describe('filterDishes', () => {
  it('filter rỗng trả đủ danh sách, giữ nguyên thứ tự', () => {
    expect(slugsFor({})).toEqual(DISHES.map((d) => d.slug))
  })

  it('gõ không dấu vẫn khớp tên có dấu: "com tam" ra Cơm tấm', () => {
    expect(slugsFor({ q: 'com tam' })).toEqual(['com-tam'])
  })

  it('không phân biệt hoa thường và đ/d: "DAU HU" ra Đậu hũ', () => {
    expect(slugsFor({ q: 'DAU HU' })).toEqual(['dau-hu'])
  })

  it('khớp cả tên tiếng Anh', () => {
    expect(slugsFor({ q: 'broken' })).toEqual(['com-tam'])
  })

  it('gõ trọn từ "pho" chỉ ra món Phở, không ra "văn phòng"', () => {
    expect(slugsFor({ q: 'pho' })).toEqual(['pho-bo', 'pho-chay'])
  })

  it('gõ dở chừng vẫn lọc theo chuỗi con: "ph" ra cả Phở lẫn văn phòng', () => {
    expect(slugsFor({ q: 'ph' })).toEqual(['pho-bo', 'pho-chay', 'com-hop-van-phong'])
  })

  it('gõ trọn nhiều từ khớp tên có các từ đó: "van phong" ra cơm hộp', () => {
    expect(slugsFor({ q: 'van phong' })).toEqual(['com-hop-van-phong'])
  })

  it('khoảng trắng thừa trong ô tìm không làm mất kết quả', () => {
    expect(slugsFor({ q: '  com   tam ' })).toEqual(['com-tam'])
  })

  it('lọc theo bữa chỉ giữ món phục vụ bữa đó', () => {
    expect(slugsFor({ meal: 'dinner' })).toEqual(['pho-bo', 'dau-hu'])
  })

  it('nhiều tag là AND: món phải có đủ mọi tag', () => {
    expect(slugsFor({ tags: ['vegetarian'] })).toEqual(['pho-chay', 'banh-mi-chay', 'dau-hu'])
    expect(slugsFor({ tags: ['vegetarian', 'quick'] })).toEqual(['pho-chay', 'dau-hu'])
    expect(slugsFor({ tags: ['vegetarian', 'beef'] })).toEqual([])
  })

  it('khoảng giá tính cả hai biên', () => {
    expect(slugsFor({ minPrice: 25_000, maxPrice: 40_000 })).toEqual([
      'com-tam',
      'pho-chay',
      'dau-hu',
      'com-hop-van-phong',
    ])
  })

  it('chỉ có giá sàn hoặc chỉ có giá trần', () => {
    expect(slugsFor({ minPrice: 40_000 })).toEqual(['pho-bo', 'pho-chay'])
    expect(slugsFor({ maxPrice: 20_000 })).toEqual(['banh-mi-chay'])
  })

  it('các điều kiện cộng dồn với nhau', () => {
    expect(
      slugsFor({ q: 'pho', meal: 'breakfast', tags: ['vegetarian'], maxPrice: 40_000 }),
    ).toEqual(['pho-chay'])
  })
})

const SEARCH_DISHES: DishCard[] = [
  ...DISHES,
  dish({ slug: 'bun-ga', nameVi: 'Bún gà', nameEn: 'Rice noodle soup with chicken' }),
  dish({ slug: 'mi-xao-bo', nameVi: 'Mì xào bò', nameEn: 'Stir-fried noodles with beef' }),
  dish({ slug: 'ca-chien', nameVi: 'Cá chiên', nameEn: 'Pan-fried fish' }),
]

/**
 * Luật tìm: từ khoá và tên món đều bỏ dấu rồi tách thành từ ở mọi ký tự không
 * phải chữ/số. Mỗi từ khoá phải khớp một từ trong tên (Việt hoặc Anh): khớp trọn
 * từ, kể cả số ít/số nhiều tiếng Anh. Từ khoá chưa là từ trọn nào trong danh mục
 * (đang gõ dở) thì khớp đầu từ.
 */
describe('filterDishes — bảng luật tìm theo từ', () => {
  it.each([
    ['pho', ['pho-bo', 'pho-chay']],
    ['ph', ['pho-bo', 'pho-chay', 'com-hop-van-phong']],
    ['noodle', ['bun-ga', 'mi-xao-bo']],
    ['noodles', ['bun-ga', 'mi-xao-bo']],
    ['noodl', ['bun-ga', 'mi-xao-bo']],
    ['stir fried', ['mi-xao-bo']],
    ['fried', ['mi-xao-bo', 'ca-chien']],
    ['com tam', ['com-tam']],
    ['com-tam', ['com-tam']],
    ['dau', ['dau-hu']],
    ['beef', ['pho-bo', 'mi-xao-bo']],
  ])('"%s" ra %j', (q, expected) => {
    expect(filterDishes(SEARCH_DISHES, { ...EMPTY_DISH_FILTER, q }).map((d) => d.slug)).toEqual(
      expected,
    )
  })
})

describe('filterDishes — chỉ món thích', () => {
  const liked = new Set(['pho-bo', 'dau-hu'])

  it('bật "chỉ món thích" chỉ giữ món user đã thích, cộng dồn với filter khác', () => {
    expect(
      filterDishes(DISHES, { ...EMPTY_DISH_FILTER, liked: true }, liked).map((d) => d.slug),
    ).toEqual(['pho-bo', 'dau-hu'])
    expect(
      filterDishes(DISHES, { ...EMPTY_DISH_FILTER, liked: true, meal: 'breakfast' }, liked).map(
        (d) => d.slug,
      ),
    ).toEqual(['pho-bo'])
  })

  it('tắt "chỉ món thích" thì danh sách món thích không lọc gì', () => {
    expect(filterDishes(DISHES, EMPTY_DISH_FILTER, liked)).toHaveLength(DISHES.length)
  })

  it('khách (không có danh sách món thích) mở URL ?liked=true vẫn thấy đủ món', () => {
    expect(filterDishes(DISHES, { ...EMPTY_DISH_FILTER, liked: true })).toHaveLength(DISHES.length)
  })
})

describe('filterDishes — tag lạ', () => {
  it('tag không món nào có bị bỏ qua thay vì làm rỗng kết quả', () => {
    expect(slugsFor({ tags: ['foo'] })).toEqual(DISHES.map((d) => d.slug))
    expect(slugsFor({ tags: ['foo', 'quick'] })).toEqual(['pho-chay', 'dau-hu'])
  })
})

describe('parsePrice', () => {
  it.each([
    [20_000, 20_000],
    ['20000', 20_000],
    ['20.000', 20_000],
    [' 1.200.000 ', 1_200_000],
    ['20,5', 205],
    ['10.000.000', 10_000_000],
    ['10.000.001', null],
    ['-5', null],
    [-5, null],
    [20_000.5, null],
    ['abc', null],
    ['', null],
    [null, null],
  ])('%j → %j', (raw, expected) => {
    expect(parsePrice(raw)).toBe(expected)
  })
})

/** Đi qua router thật: router ghép search thô của URL với kết quả `validateSearch`. */
function searchAt(href: string): DishSearch {
  const rootRoute = createRootRoute()
  const dishesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dishes',
    validateSearch: parseDishSearch,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([dishesRoute]),
    history: createMemoryHistory({ initialEntries: [href] }),
    parseSearch,
  })
  const match = router.matchRoutes(router.state.location).at(-1)
  return match?.search as DishSearch
}

describe('URL /dishes qua router', () => {
  it.each([
    '/dishes?q=123',
    '/dishes?q=%7B%7D',
    '/dishes?q=%20%20',
    '/dishes?tag=5',
    '/dishes?tag=true',
    '/dishes?tag=VEG',
    '/dishes?meal=brunch',
    '/dishes?meal=%5B%22dinner%22%5D',
    '/dishes?meal=lunch&meal=dinner',
    '/dishes?min=abc',
    '/dishes?max=abc',
    '/dishes?min=-5',
    '/dishes?max=20000.5',
    '/dishes?liked=1',
    '/dishes?liked=false',
    '/dishes?liked=%22true%22',
  ])('%s: tham số rác bị bỏ, filter rỗng, đủ món', (href) => {
    const filter = toDishFilter(searchAt(href))

    expect(filter).toEqual(EMPTY_DISH_FILTER)
    expect(filterDishes(DISHES, filter)).toHaveLength(DISHES.length)
  })

  it('tham số rác không kéo theo tham số hợp lệ', () => {
    expect(toDishFilter(searchAt('/dishes?q=pho&tag=5&meal=dinner&min=abc'))).toEqual({
      ...EMPTY_DISH_FILTER,
      q: 'pho',
      meal: 'dinner',
    })
  })

  it('?liked=true bật "chỉ món thích"', () => {
    expect(toDishFilter(searchAt('/dishes?liked=true&meal=lunch'))).toEqual({
      ...EMPTY_DISH_FILTER,
      meal: 'lunch',
      liked: true,
    })
  })

  it('giá trên URL đọc dấu chấm là phân cách hàng nghìn', () => {
    expect(toDishFilter(searchAt('/dishes?min=20.000&max=45000'))).toMatchObject({
      minPrice: 20_000,
      maxPrice: 45_000,
    })
  })
})

describe('toDishFilter', () => {
  it('giá trị sai kiểu không bao giờ làm vỡ trang', () => {
    const raw = { q: 123, tag: 5, meal: 'brunch', min: 'abc' } as unknown as DishSearch

    expect(toDishFilter(raw)).toEqual(EMPTY_DISH_FILTER)
  })
})

describe('parseDishSearch', () => {
  it('URL trống cho search trống', () => {
    expect(parseDishSearch({})).toEqual({})
  })

  it('nhận đủ tham số hợp lệ', () => {
    expect(
      parseDishSearch({ q: 'phở', meal: 'breakfast', tag: 'vegetarian', min: 20000, max: 40000 }),
    ).toEqual({ q: 'phở', meal: 'breakfast', tag: 'vegetarian', min: 20_000, max: 40_000 })
  })

  it('nhận nhiều tag từ dấu phẩy hoặc từ tham số lặp lại, bỏ trùng', () => {
    expect(parseDishSearch({ tag: 'vegetarian,quick' })).toEqual({ tag: 'vegetarian,quick' })
    expect(parseDishSearch({ tag: ['vegetarian', 'quick', 'vegetarian'] })).toEqual({
      tag: 'vegetarian,quick',
    })
  })

  it('giá trị rác bị bỏ, không báo lỗi', () => {
    expect(
      parseDishSearch({
        q: '   ',
        meal: 'brunch',
        tag: '<script>,,',
        min: -5,
        max: 'nhiều',
        page: 3,
      }),
    ).toEqual({})
  })

  it('giá dạng chuỗi số vẫn nhận, số lẻ bị bỏ', () => {
    expect(parseDishSearch({ min: '20000', max: 1.5 })).toEqual({ min: 20_000 })
  })

  it('luôn trả đủ mọi khoá nó quản lý để router không giữ lại giá trị thô', () => {
    expect(Object.keys(parseDishSearch({})).sort()).toEqual([
      'liked',
      'max',
      'meal',
      'min',
      'q',
      'tag',
    ])
  })

  it('cắt từ khoá quá dài', () => {
    expect(parseDishSearch({ q: 'a'.repeat(500) }).q).toHaveLength(80)
  })
})

describe('toDishFilter / toDishSearch', () => {
  it('search trống thành filter rỗng', () => {
    expect(toDishFilter({})).toEqual(EMPTY_DISH_FILTER)
  })

  it('đi vòng search → filter → search giữ nguyên', () => {
    const search = {
      q: 'pho',
      meal: 'lunch',
      tag: 'soup,quick',
      min: 1_000,
      max: 9_000,
      liked: true,
    } as const

    expect(toDishFilter(search)).toEqual({
      q: 'pho',
      meal: 'lunch',
      tags: ['soup', 'quick'],
      minPrice: 1_000,
      maxPrice: 9_000,
      liked: true,
    })
    expect(toDishSearch(toDishFilter(search))).toEqual(search)
  })

  it('filter rỗng không ghi tham số nào lên URL', () => {
    expect(toDishSearch(EMPTY_DISH_FILTER)).toEqual({})
    expect(toDishSearch({ ...EMPTY_DISH_FILTER, q: '  ' })).toEqual({})
  })
})
