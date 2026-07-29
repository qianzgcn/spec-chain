import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";

const usernameSchema = z
  .string()
  .trim()
  .min(1, "请输入用户名")
  .max(50, "用户名不能超过 50 个字符");

const passwordSchema = z.string().min(8, "密码至少需要 8 位");

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(UserRole),
});

export const updateUserSchema = z.object({
  id: z.string().min(1),
  username: usernameSchema,
  role: z.enum(UserRole),
});

export const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: passwordSchema,
});

export const userFormSchema = z
  .object({
    id: z.string().optional(),
    username: usernameSchema,
    password: z.string(),
    role: z.enum(UserRole),
  })
  .superRefine((value, context) => {
    if (!value.id && value.password.length < 8) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "密码至少需要 8 位",
      });
    }
  });

export const resetPasswordFormSchema = z.object({
  password: passwordSchema,
});

export type UserFormValues = z.infer<typeof userFormSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
