import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少需要 8 位"),
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的新密码不一致",
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
