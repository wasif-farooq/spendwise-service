# SpendWise API Documentation

This document outlines the API endpoints available in the SpendWise Backend. All API requests should be prefixed with `/api/v1`.

## Authentication

**Base URL**: `/auth`

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Authenticate user and get JWT token. | No |
| `GET` | `/me` | Get current authenticated user details. | Yes (Bearer Token) |
| `POST` | `/register` | Register a new user and create default organization. | No |
| `POST` | `/verify-email` | Verify user email address with code. | No |
| `POST` | `/verify-2fa` | Verify 2FA code during login. | No |
| `POST` | `/resend-2fa` | Resend 2FA verification code. | No |
| `POST` | `/verify-backup-code` | Login using a backup code. | No |
| `POST` | `/forgot-password` | Request password reset code via email. | No |
| `POST` | `/verify-reset-code` | Verify password reset code. | No |
| `POST` | `/reset-password` | Reset password using verified token. | No |

---

## Organizations

**Base URL**: `/organizations`
**Auth Required**: Yes (Bearer Token)

| Method | Endpoint | Description | Permission Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | List all organizations the user is a member of. | - |
| `PUT` | `/:id` | Update organization details (e.g., name). | `org:update` |
| `DELETE` | `/:id` | Delete an organization. | `org:delete` |
| `GET` | `/:id/members` | Get list of members in an organization. | - |
| `POST` | `/:id/members/invite` | Invite a new member to the organization. | `member:manage` |
| `DELETE` | `/:id/members/:memberId` | Remove a member from the organization. | `member:manage` |
| `PUT` | `/:id/members/:memberId/role` | Assign a role to a member. | `member:manage` |
| `GET` | `/:id/roles` | List all roles in an organization. | `role:read` |
| `PUT` | `/:id/roles/:roleId` | Update a role's permissions. | `role:manage` |
| `DELETE` | `/:id/roles/:roleId` | Delete a role. | `role:manage` |

---

## Settings & Preferences

**Base URL**: `/settings`
**Auth Required**: Yes (Bearer Token)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/preferences` | Get current user preferences (theme, language, etc.). |
| `PUT` | `/preferences` | Update user preferences. |
| `GET` | `/security` | Get security settings status (e.g., 2FA enabled). |
| `PUT` | `/change-password` | Change current user's password. |
| `POST` | `/2fa/setup` | Generate 2FA secret and QR code. |
| `POST` | `/2fa/enable` | Enable 2FA with verification code. |
| `POST` | `/2fa/disable` | Disable 2FA. |

---

## RBAC Permissions

The following permissions are available for defining custom roles. A role acts as a collection of these granular permissions.

- `*`: Full access (Super Admin)

**Dashboard & General**
- `dashboard:view`: View the dashboard.

**Organization Management**
- `organization:update`: Update organization details.
- `organization:delete`: Delete the organization.

**Member Management**
- `members:view`: View list of members.
- `members:create`: Invite new members.
- `members:delete`: Remove members.
- `members:edit`: Assign roles to members.

**Role Management**
- `roles:view`: View available roles.
- `roles:edit`: Update role permissions.
- `roles:create`: Create new roles.
- `roles:delete`: Delete roles.

**Transactions & Billing**
- `transactions:view`: View transactions.
- `transactions:create`: Create transactions.
- `transactions:edit`: Edit transactions.
- `transactions:delete`: Delete transactions.
- `billing:view`: View billing information.
- `billing:edit`: Manage billing settings.
- `accounts:view`: View linked accounts.
- `accounts:create`: Link new accounts.
- `accounts:edit`: Manage linked accounts (access).
- `accounts:delete`: Remove linked accounts.

## Error Responses

The API uses standard HTTP status codes:

- `200 OK`: Request succeeded.
- `201 Created`: Resource created successfully.
- `400 Bad Request`: Invalid input or validation error.
- `401 Unauthorized`: Missing or invalid authentication token.
- `403 Forbidden`: User does not have the required permission.
- `404 Not Found`: Resource not found.
- `500 Internal Server Error`: An unexpected error occurred.
