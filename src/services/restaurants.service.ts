import {
  getSupabase,
  getUserSupabase,
  throwDatabaseError,
} from "../config/supabase";

import Restaurant from "../models/restaurant.model";
import type { RestaurantInsert } from "../types/database.types";
import type { AppUser } from "../types/auth.types";
import HttpError from "../utils/httpError";
import {
  menuField,
  numericId,
  objectBody,
  textField,
} from "../utils/input";

function restaurantInput(
  value: unknown,
  partial = false,
): Partial<RestaurantInsert> {
  const input = objectBody(value);
  const row: Partial<RestaurantInsert> = {};

  for (const field of ["name", "category", "location"] as const) {
    if (!partial || input[field] !== undefined) {
      row[field] = textField(input[field], field, true, 300);
    }
  }

  for (const [external, column] of [
    ["priceRange", "price_range"],
    ["description", "description"],
    ["image", "image"],
  ] as const) {
    if (input[external] !== undefined) {
      row[column] = textField(input[external], external);
    }
  }

  if (input.rating !== undefined) {
    if (
      !["string", "number"].includes(typeof input.rating) ||
      input.rating === ""
    ) {
      throw new HttpError(
        400,
        "평점은 0~5 사이의 숫자여야 합니다.",
      );
    }

    const rating = Number(input.rating);

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      throw new HttpError(
        400,
        "평점은 0~5 사이의 숫자여야 합니다.",
      );
    }

    row.rating = rating;
  }

  if (input.recommendedMenu !== undefined) {
    row.recommended_menu = menuField(input.recommendedMenu);
  }

  if (partial && !Object.keys(row).length) {
    throw new HttpError(400, "수정할 값을 입력하세요.");
  }

  return row;
}

// 공개: 전체 맛집 조회
export async function getAllRestaurants() {
  const { data, error } = await getSupabase()
    .from("restaurants")
    .select("*")
    .order("id");

  if (error) throwDatabaseError(error);

  return (data ?? []).map(Restaurant.fromDatabase);
}

// 공개: 맛집 상세 조회
export async function getRestaurantById(id: string) {
  const { data, error } = await getSupabase()
    .from("restaurants")
    .select("*")
    .eq("id", numericId(id))
    .maybeSingle();

  if (error) throwDatabaseError(error);

  if (!data) {
    throw new HttpError(404, "Restaurant not found");
  }

  return Restaurant.fromDatabase(data);
}

// 공개: 인기 맛집 조회
export async function getPopularRestaurants(
  limit: unknown = "5",
) {
  if (
    typeof limit !== "string" ||
    !/^\d+$/.test(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 50
  ) {
    throw new HttpError(
      400,
      "limit은 1~50 사이의 정수여야 합니다.",
    );
  }

  const { data, error } = await getSupabase()
    .from("restaurants")
    .select("*")
    .order("rating", { ascending: false })
    .order("id")
    .limit(Number(limit));

  if (error) throwDatabaseError(error);

  return (data ?? []).map(Restaurant.fromDatabase);
}

// 수정·삭제 전 본인 또는 관리자 여부 확인
async function writableRestaurant(
  id: string,
  actor: AppUser,
  token: string,
) {
  const db = getUserSupabase(token);

  const { data, error } = await db
    .from("restaurants")
    .select("*")
    .eq("id", numericId(id))
    .maybeSingle();

  if (error) throwDatabaseError(error);

  if (!data) {
    throw new HttpError(404, "Restaurant not found");
  }

  if (
    !actor.isActive ||
    (
      actor.userType !== "admin" &&
      data.created_by !== actor.id
    )
  ) {
    throw new HttpError(
      403,
      "본인이 등록한 음식점만 변경할 수 있습니다.",
    );
  }

  return db;
}

// 회원: 본인 명의로 맛집 등록
export async function createRestaurant(
  value: unknown,
  actor: AppUser,
  token: string,
) {
  const row = restaurantInput(value) as RestaurantInsert;

  // 요청 본문의 등록자 대신 검증된 사용자 ID를 사용합니다.
  row.created_by = actor.id;

  const { data, error } = await getUserSupabase(token)
    .from("restaurants")
    .insert(row)
    .select("*")
    .single();

  if (error) throwDatabaseError(error);

  return Restaurant.fromDatabase(data!);
}

// 등록자 본인 또는 관리자: 수정
export async function updateRestaurant(
  id: string,
  value: unknown,
  actor: AppUser,
  token: string,
) {
  const row = restaurantInput(value, true);
  const db = await writableRestaurant(id, actor, token);

  const { data, error } = await db
    .from("restaurants")
    .update(row)
    .eq("id", numericId(id))
    .select("*")
    .maybeSingle();

  if (error) throwDatabaseError(error);

  if (!data) {
    throw new HttpError(
      403,
      "이 음식점을 변경할 권한이 없습니다.",
    );
  }

  return Restaurant.fromDatabase(data);
}

// 등록자 본인 또는 관리자: 삭제
export async function deleteRestaurant(
  id: string,
  actor: AppUser,
  token: string,
) {
  const db = await writableRestaurant(id, actor, token);

  const { data, error } = await db
    .from("restaurants")
    .delete()
    .eq("id", numericId(id))
    .select("id")
    .maybeSingle();

  if (error) throwDatabaseError(error);

  if (!data) {
    throw new HttpError(
      403,
      "이 음식점을 삭제할 권한이 없습니다.",
    );
  }
}