import { describe, it, expect } from "vitest";
import { loginSchema, createWorkerSchema, createClientSchema, applySchema, closeMonthSchema, portalHoursSchema, createJobPostingSchema, createInvoiceSchema, gdprRequestSchema } from "../lib/validators.js";

describe("Validation Schemas", () => {
  describe("loginSchema", () => {
    it("accepts valid login", () => {
      const result = loginSchema.safeParse({ email: "test@example.com", password: "secret123" });
      expect(result.success).toBe(true);
    });

    it("rejects missing email", () => {
      const result = loginSchema.safeParse({ password: "secret123" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = loginSchema.safeParse({ email: "notanemail", password: "secret123" });
      expect(result.success).toBe(false);
    });

    it("rejects empty password", () => {
      const result = loginSchema.safeParse({ email: "test@example.com", password: "" });
      expect(result.success).toBe(false);
    });

    it("normalizes email to lowercase", () => {
      const result = loginSchema.safeParse({ email: "TEST@Example.COM", password: "secret" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.email).toBe("test@example.com");
    });
  });

  describe("createWorkerSchema", () => {
    it("accepts valid worker", () => {
      const result = createWorkerSchema.safeParse({ name: "John Doe" });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createWorkerSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("strips HTML from name", () => {
      const result = createWorkerSchema.safeParse({ name: "<script>alert('xss')</script>John" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).not.toContain("<script>");
    });

    it("accepts optional fields", () => {
      const result = createWorkerSchema.safeParse({
        name: "Jane",
        email: "jane@test.com",
        hourlyNettoRate: 25.50,
        trcExpiry: "2025-12-31",
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative hourly rate", () => {
      const result = createWorkerSchema.safeParse({ name: "Jane", hourlyNettoRate: -5 });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date format", () => {
      const result = createWorkerSchema.safeParse({ name: "Jane", trcExpiry: "12/31/2025" });
      expect(result.success).toBe(false);
    });
  });

  describe("createClientSchema", () => {
    it("accepts valid client", () => {
      const result = createClientSchema.safeParse({ name: "Acme Corp" });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createClientSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("applySchema", () => {
    it("accepts valid application", () => {
      const result = applySchema.safeParse({ name: "John", email: "john@test.com" });
      expect(result.success).toBe(true);
    });

    it("rejects missing email", () => {
      const result = applySchema.safeParse({ name: "John" });
      expect(result.success).toBe(false);
    });
  });

  describe("closeMonthSchema", () => {
    it("accepts valid month", () => {
      const result = closeMonthSchema.safeParse({ monthYear: "2026-03" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid format", () => {
      const result = closeMonthSchema.safeParse({ monthYear: "March 2026" });
      expect(result.success).toBe(false);
    });
  });

  describe("portalHoursSchema", () => {
    it("accepts valid hours", () => {
      const result = portalHoursSchema.safeParse({ date: "2026-03-29", hours: 8 });
      expect(result.success).toBe(true);
    });

    it("rejects hours > 24", () => {
      const result = portalHoursSchema.safeParse({ date: "2026-03-29", hours: 25 });
      expect(result.success).toBe(false);
    });

    it("rejects negative hours", () => {
      const result = portalHoursSchema.safeParse({ date: "2026-03-29", hours: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe("createJobPostingSchema", () => {
    it("accepts valid job posting", () => {
      const result = createJobPostingSchema.safeParse({ title: "TIG Welder", location: "Warsaw" });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createJobPostingSchema.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("createInvoiceSchema", () => {
    it("accepts valid invoice", () => {
      const result = createInvoiceSchema.safeParse({
        clientId: "550e8400-e29b-41d4-a716-446655440000",
        monthYear: "2026-03",
        items: [{ workerId: "550e8400-e29b-41d4-a716-446655440001", workerName: "Jan", hours: 160, rate: 25, amount: 4000 }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty items", () => {
      const result = createInvoiceSchema.safeParse({
        clientId: "550e8400-e29b-41d4-a716-446655440000",
        monthYear: "2026-03",
        items: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("gdprRequestSchema", () => {
    it("accepts valid request", () => {
      const result = gdprRequestSchema.safeParse({
        workerId: "550e8400-e29b-41d4-a716-446655440000",
        requestType: "export",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid request type", () => {
      const result = gdprRequestSchema.safeParse({
        workerId: "550e8400-e29b-41d4-a716-446655440000",
        requestType: "delete_everything",
      });
      expect(result.success).toBe(false);
    });
  });
});
