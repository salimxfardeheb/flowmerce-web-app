import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: string;
    vendorId: string | null;
    vendorStatus: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      vendorId: string | null;
      vendorStatus: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    vendorId: string | null;
    vendorStatus: string | null;
  }
}