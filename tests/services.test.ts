jest.mock("../src/config/supabase", () => ({
  ...jest.requireActual("../src/config/supabase"),
  getSupabase: jest.fn(),
  getUserSupabase: jest.fn(),
}));

import {
  getSupabase,
  getUserSupabase,
} from "../src/config/supabase";
import * as restaurants from "../src/services/restaurants.service";
import * as submissions from "../src/services/submissions.service";
import * as users from "../src/services/users.service";
import type { AppUser } from "../src/types/auth.types";

const query = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
};

const client = {
  from: jest.fn(() => query),
  rpc: jest.fn(),
};

const actor: AppUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "real@example.test",
  name: "실제 사용자",
  avatar: "",
  provider: "email",
  userType: "user",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const row = {
  id: 4,
  created_by: actor.id,
  name: "식당",
  category: "한식",
  location: "캠퍼스",
  price_range: "정보 없음",
  rating: 0,
  description: "",
  recommended_menu: [],
  likes: 0,
  image: "",
};

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(getSupabase).mockReturnValue(
    client as unknown as ReturnType<typeof getSupabase>,
  );

  jest.mocked(getUserSupabase).mockReturnValue(
    client as unknown as ReturnType<typeof getUserSupabase>,
  );

  query.single.mockResolvedValue({
    data: row,
    error: null,
  });

  query.maybeSingle.mockResolvedValue({
    data: row,
    error: null,
  });
});

test("등록자는 검증된 사용자이며 ID·관리 필드는 복사하지 않는다", async () => {
  const result = await restaurants.createRestaurant(
    {
      id: 99,
      likes: 200,
      source_submission_id: 8,
      created_by: "forged",
      name: "식당",
      category: "한식",
      location: "캠퍼스",
      recommendedMenu: "김밥, 라면",
    },
    actor,
    "member-jwt",
  );

  expect(getUserSupabase).toHaveBeenCalledWith("member-jwt");

  expect(query.insert).toHaveBeenCalledWith({
    name: "식당",
    category: "한식",
    location: "캠퍼스",
    recommended_menu: ["김밥", "라면"],
    created_by: actor.id,
  });

  expect(result).toMatchObject({
    id: 4,
    priceRange: "정보 없음",
    createdBy: actor.id,
  });
});

test("본인 글의 부분 수정은 생략한 필드를 지우지 않는다", async () => {
  await restaurants.updateRestaurant(
    "4",
    { name: "새 이름" },
    actor,
    "member-jwt",
  );

  expect(query.update).toHaveBeenCalledWith({
    name: "새 이름",
  });
});

test("다른 회원의 수정·삭제는 403으로 차단한다", async () => {
  const other: AppUser = {
    ...actor,
    id: "22222222-2222-4222-8222-222222222222",
  };

  await expect(
    restaurants.updateRestaurant(
      "4",
      { name: "타인 수정" },
      other,
      "other-jwt",
    ),
  ).rejects.toMatchObject({ statusCode: 403 });

  await expect(
    restaurants.deleteRestaurant("4", other, "other-jwt"),
  ).rejects.toMatchObject({ statusCode: 403 });

  expect(query.update).not.toHaveBeenCalled();
  expect(query.delete).not.toHaveBeenCalled();
});

test("관리자는 타인 글을 수정하고 등록자 변경 입력은 무시한다", async () => {
  const admin: AppUser = {
    ...actor,
    id: "33333333-3333-4333-8333-333333333333",
    userType: "admin",
  };

  await restaurants.updateRestaurant(
    "4",
    {
      name: "관리자 수정",
      created_by: "forged",
      createdBy: "forged",
    },
    admin,
    "admin-jwt",
  );

  expect(query.update).toHaveBeenCalledWith({
    name: "관리자 수정",
  });
});

test("본인은 자신의 음식점을 삭제할 수 있다", async () => {
  await restaurants.deleteRestaurant("4", actor, "member-jwt");
  expect(query.delete).toHaveBeenCalledTimes(1);
});

test("RLS 권한 오류는 403으로 전달한다", async () => {
  query.single.mockResolvedValueOnce({
    data: null,
    error: {
      code: "42501",
      message: "row-level security policy",
    },
  });

  await expect(
    restaurants.createRestaurant(
      {
        name: "식당",
        category: "한식",
        location: "캠퍼스",
      },
      actor,
      "member-jwt",
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
});

test("제보자·상태는 검증된 계정과 서버 기본값을 사용한다", async () => {
  query.single.mockResolvedValue({
    data: {
      ...row,
      restaurant_name: "식당",
      status: "pending",
    },
    error: null,
  });

  await submissions.createSubmission(
    {
      restaurantName: "식당",
      category: "한식",
      location: "캠퍼스",
      submitterId: "forged",
      submitterEmail: "forged@example.test",
      status: "approved",
    },
    actor,
  );

  expect(query.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      submitter_id: actor.id,
      submitter_email: actor.email,
      submitter_name: actor.name,
      status: "pending",
    }),
  );
});

test("프로필 수정으로 역할·활성 상태를 변경할 수 없다", async () => {
  query.single.mockResolvedValue({
    data: {
      id: actor.id,
      name: "변경",
      user_type: "user",
      is_active: true,
    },
    error: null,
  });

  await users.updateProfile(actor.id, {
    name: "변경",
    userType: "admin",
    user_type: "admin",
    is_active: false,
  });

  expect(query.update).toHaveBeenCalledWith({
    name: "변경",
  });
});

test("제보 상태 수정으로 승인을 우회할 수 없다", async () => {
  await expect(
    submissions.rejectSubmission(
      "1",
      { status: "approved" },
      actor,
    ),
  ).rejects.toMatchObject({ statusCode: 400 });

  expect(query.update).not.toHaveBeenCalled();
});

test("승인은 검증한 검토자 ID로 RPC를 호출한다", async () => {
  client.rpc.mockResolvedValue({
    data: [row],
    error: null,
  });

  await submissions.approveSubmission("1", actor);

  expect(client.rpc).toHaveBeenCalledWith(
    "approve_foodmap_submission",
    {
      p_submission_id: 1,
      p_reviewer_id: actor.id,
    },
  );
});

test.each([
  undefined,
  {},
  { name: " ", category: "한식", location: "캠퍼스" },
  {
    name: "식당",
    category: "한식",
    location: "캠퍼스",
    rating: 6,
  },
])("잘못된 맛집 입력을 거절한다: %p", async (input) => {
  await expect(
    restaurants.createRestaurant(input, actor, "member-jwt"),
  ).rejects.toMatchObject({ statusCode: 400 });
});

test("없는 음식점 수정은 404, 마지막 관리자 변경은 409", async () => {
  query.maybeSingle.mockResolvedValueOnce({
    data: null,
    error: null,
  });

  await expect(
    restaurants.updateRestaurant(
      "99",
      { name: "새 이름" },
      actor,
      "member-jwt",
    ),
  ).rejects.toMatchObject({ statusCode: 404 });

  client.rpc.mockResolvedValueOnce({
    data: null,
    error: {
      message: "LAST_ADMIN",
      code: "P0001",
    },
  });

  await expect(
    users.changeUserType(actor.id, { userType: "user" }),
  ).rejects.toMatchObject({ statusCode: 409 });

  client.rpc.mockResolvedValueOnce({
    data: null,
    error: {
      message: "REVIEWER_NOT_ADMIN",
      code: "42501",
    },
  });

  await expect(
    submissions.approveSubmission("1", actor),
  ).rejects.toMatchObject({ statusCode: 403 });
});