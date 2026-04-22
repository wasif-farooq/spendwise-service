# Graph Report - .  (2026-04-22)

## Corpus Check
- Corpus is ~49,035 words - fits in a single context window. You may not need a graph.

## Summary
- 1152 nodes · 1933 edges · 42 communities detected
- Extraction: 64% EXTRACTED · 36% INFERRED · 0% AMBIGUOUS · INFERRED: 691 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Account Repository|Account Repository]]
- [[_COMMUNITY_Bootstrap & Controllers|Bootstrap & Controllers]]
- [[_COMMUNITY_Auth Service|Auth Service]]
- [[_COMMUNITY_Account Controller|Account Controller]]
- [[_COMMUNITY_Config & Middleware|Config & Middleware]]
- [[_COMMUNITY_Auth Request Repository|Auth Request Repository]]
- [[_COMMUNITY_Account Service|Account Service]]
- [[_COMMUNITY_Category Controller|Category Controller]]
- [[_COMMUNITY_Auth Repository|Auth Repository]]
- [[_COMMUNITY_User Model|User Model]]
- [[_COMMUNITY_Workspace Request|Workspace Request]]
- [[_COMMUNITY_Repository Factory|Repository Factory]]
- [[_COMMUNITY_Transaction Model|Transaction Model]]
- [[_COMMUNITY_Account Model|Account Model]]
- [[_COMMUNITY_User Subscription|User Subscription]]
- [[_COMMUNITY_Workspace Service|Workspace Service]]
- [[_COMMUNITY_Feature Flags|Feature Flags]]
- [[_COMMUNITY_Storage Service|Storage Service]]
- [[_COMMUNITY_Analytics|Analytics]]
- [[_COMMUNITY_Messaging|Messaging]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]

## God Nodes (most connected - your core abstractions)
1. `findById()` - 45 edges
2. `User` - 31 edges
3. `WorkspaceService` - 30 edges
4. `save()` - 29 edges
5. `WorkspaceRequestRepository` - 28 edges
6. `WorkspaceController` - 26 edges
7. `TransactionRepository` - 26 edges
8. `AuthService` - 24 edges
9. `AuthRequestRepository` - 24 edges
10. `RepositoryFactory` - 22 edges

## Surprising Connections (you probably didn't know these)
- `authMiddleware()` --calls--> `verify()`  [INFERRED]
  src/@shared/middleware/auth.middleware.ts → scripts/verification/verify_subscription_flow.ts
- `getData()` --calls--> `getProps()`  [INFERRED]
  src/@shared/repositories/BaseRepository.ts → src/@shared/Entity.ts

## Communities

### Community 0 - "Account Repository"
Cohesion: 0.02
Nodes (16): AccountRepository, ArchiveWorker, TransactionArchiveService, CategoryRepository, CreateAuthIdentityQuery, CreateUserQuery, getProps(), ExchangeRateRepository (+8 more)

### Community 1 - "Bootstrap & Controllers"
Cohesion: 0.03
Nodes (22): AccountControllerFactory, ApplicationBootstrap, authMiddleware(), AuthService, Container, startWorker(), KafkaClient, KafkaRequestReply (+14 more)

### Community 2 - "Auth Service"
Cohesion: 0.04
Nodes (15): create(), findById(), getData(), mapToDb(), mapToEntity(), save(), toSnakeCase(), update() (+7 more)

### Community 3 - "Account Controller"
Cohesion: 0.04
Nodes (9): AccountController, AIController, AnalyticsController, AuthController, toJSON(), AccountValidators, TransactionController, WorkspaceController (+1 more)

### Community 4 - "Config & Middleware"
Cohesion: 0.05
Nodes (11): delete(), ConfigLoader, errorMiddleware(), main(), ExchangeRateController, ExchangeRateService, getPermissionsFromDB(), CronScheduler (+3 more)

### Community 5 - "Auth Request Repository"
Cohesion: 0.07
Nodes (3): AuthRequestRepository, SettingsController, UserPreference

### Community 6 - "Account Service"
Cohesion: 0.06
Nodes (3): AccountService, AnalyticsService, TransactionService

### Community 7 - "Category Controller"
Cohesion: 0.07
Nodes (7): findAll(), CategoryController, getCategoryService(), CategoryService, FeatureFlag, FeatureFlagRepository, FeatureFlagService

### Community 8 - "Auth Repository"
Cohesion: 0.08
Nodes (7): AuthIdentityMapper, AuthRepository, FindAuthIdentityQuery, FindUserByEmailQuery, FindUserByIdQuery, UpdateAuthIdentityQuery, UserRepository

### Community 9 - "User Model"
Cohesion: 0.07
Nodes (1): User

### Community 10 - "Workspace Request"
Cohesion: 0.2
Nodes (1): WorkspaceRequestRepository

### Community 11 - "Repository Factory"
Cohesion: 0.13
Nodes (1): RepositoryFactory

### Community 12 - "Transaction Model"
Cohesion: 0.09
Nodes (1): Transaction

### Community 13 - "Account Model"
Cohesion: 0.11
Nodes (1): Account

### Community 14 - "User Subscription"
Cohesion: 0.13
Nodes (1): UserSubscription

### Community 15 - "Workspace Service"
Cohesion: 0.13
Nodes (1): Workspace

### Community 16 - "Feature Flags"
Cohesion: 0.2
Nodes (2): SubscriptionService, UserPreferencesRepository

### Community 17 - "Storage Service"
Cohesion: 0.28
Nodes (1): UserRequestRepository

### Community 18 - "Analytics"
Cohesion: 0.15
Nodes (3): PostgresDatabase, PostgresFactory, PostgresTransaction

### Community 19 - "Messaging"
Cohesion: 0.17
Nodes (1): SubscriptionPlan

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (1): Category

### Community 21 - "Community 21"
Cohesion: 0.21
Nodes (2): ApiRouter, Server

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (1): WorkspaceRole

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (1): MockAuthRequestRepository

### Community 24 - "Community 24"
Cohesion: 0.24
Nodes (2): SubscriptionPlanRepository, UserSubscriptionRepository

### Community 25 - "Community 25"
Cohesion: 0.2
Nodes (1): AuthIdentity

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (1): ExchangeRate

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (2): KafkaMessageQueueFactory, MessagingFacade

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (1): DatabaseFacade

### Community 29 - "Community 29"
Cohesion: 0.25
Nodes (2): MockFeatureFlagRequestRepository, FeatureFlagController

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (1): MetricsService

### Community 31 - "Community 31"
Cohesion: 0.29
Nodes (1): CacheFacade

### Community 32 - "Community 32"
Cohesion: 0.48
Nodes (1): FeatureFlagRequestRepository

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (1): UserController

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (1): Email

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (2): UrlVersionStrategy, versionMiddleware()

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (1): AppError

### Community 37 - "Community 37"
Cohesion: 0.5
Nodes (1): UserControllerFactory

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (1): WorkspaceRolesControllerFactory

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (1): FeatureFlagControllerFactory

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (1): AuthControllerFactory

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (1): WorkspaceControllerFactory

## Knowledge Gaps
- **Thin community `User Model`** (30 nodes): `User.ts`, `User`, `.avatar()`, `.backupCodes()`, `.constructor()`, `.create()`, `.createdAt()`, `.delete()`, `.deletedAt()`, `.disable2FA()`, `.disableMethod()`, `.email()`, `.emailVerificationCode()`, `.emailVerified()`, `.emailVerifiedAt()`, `.enable2FA()`, `.firstName()`, `.isActive()`, `.lastName()`, `.restore()`, `.role()`, `.setEmailVerificationCode()`, `.twoFactorEnabled()`, `.twoFactorMethod()`, `.twoFactorMethods()`, `.twoFactorSecret()`, `.updateBackupCodes()`, `.updatedAt()`, `.updateName()`, `.verifyEmail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Workspace Request`** (28 nodes): `WorkspaceRequestRepository.ts`, `WorkspaceRequestRepository`, `.acceptInvitation()`, `.assignRole()`, `.cancelInvitation()`, `.checkPermission()`, `.create()`, `.createRole()`, `.delete()`, `.deleteRole()`, `.duplicateRole()`, `.getById()`, `.getInvitations()`, `.getMember()`, `.getMembers()`, `.getMode()`, `.getMyInvitations()`, `.getRole()`, `.getRoles()`, `.inviteMember()`, `.list()`, `.removeMember()`, `.resendInvitation()`, `.update()`, `.updateMember()`, `.updateRole()`, `.uploadLogo()`, `.wrap()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Repository Factory`** (24 nodes): `.service()`, `RepositoryFactory`, `.constructor()`, `.createAccountRepository()`, `.createAuthRepository()`, `.createCategoryRepository()`, `.createFeatureFlagRepository()`, `.createStorageRepository()`, `.createTransactionRepository()`, `.createUserRepository()`, `.createWorkspaceInvitationsRepository()`, `.createWorkspaceMembersRepository()`, `.createWorkspaceRepository()`, `.createWorkspaceRoleRepository()`, `.getAuthRepository()`, `.getCurrentMode()`, `.getFeatureFlagsRepository()`, `.getUsersRepository()`, `.getWorkspaceRepository()`, `.createAuthService()`, `.createWorkspaceService()`, `RepositoryFactory.ts`, `RepositoryFactory.ts`, `.service()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Transaction Model`** (22 nodes): `Transaction.ts`, `Transaction`, `.accountId()`, `.amount()`, `.baseAmount()`, `.categoryId()`, `.categoryName()`, `.constructor()`, `.convertedAmount()`, `.create()`, `.createdAt()`, `.currency()`, `.date()`, `.description()`, `.exchangeRate()`, `.linkedTransactionIds()`, `.restore()`, `.toJSON()`, `.type()`, `.updatedAt()`, `.userId()`, `.workspaceId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Account Model`** (19 nodes): `Account`, `.balance()`, `.color()`, `.constructor()`, `.create()`, `.createdAt()`, `.currency()`, `.lastActivity()`, `.name()`, `.restore()`, `.totalExpense()`, `.totalIncome()`, `.type()`, `.updateBalance()`, `.updatedAt()`, `.updateIncomeExpense()`, `.userId()`, `.workspaceId()`, `Account.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `User Subscription`** (15 nodes): `UserSubscription.ts`, `UserSubscription`, `.constructor()`, `.create()`, `.currentPeriodEnd()`, `.featuresSnapshot()`, `.limitsSnapshot()`, `.merchantSubscriptionId()`, `.paymentProvider()`, `.planId()`, `.restore()`, `.startDate()`, `.status()`, `.upgrade()`, `.userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Workspace Service`** (15 nodes): `Workspace.ts`, `Workspace`, `.changeName()`, `.constructor()`, `.create()`, `.description()`, `.industry()`, `.logo()`, `.name()`, `.ownerId()`, `.restore()`, `.size()`, `.slug()`, `.updateDetails()`, `.website()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Feature Flags`** (15 nodes): `SubscriptionService.ts`, `UserPreferencesRepository.ts`, `SubscriptionService`, `.checkAccountTransactionLimit()`, `.checkFeatureLimit()`, `.constructor()`, `.downgrade()`, `.getCurrentSubscription()`, `.subscribe()`, `.upgrade()`, `UserPreferencesRepository`, `.constructor()`, `.findByUserId()`, `.mapToEntity()`, `.save()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Storage Service`** (13 nodes): `.createUserPreferencesRepository()`, `.createUserPreferencesService()`, `UserRequestRepository.ts`, `UserRequestRepository`, `.getMode()`, `.getPreferences()`, `.getProfile()`, `.preferencesService()`, `.service()`, `.updatePreferences()`, `.updateProfile()`, `.uploadAvatar()`, `.wrap()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Messaging`** (12 nodes): `SubscriptionPlan.ts`, `SubscriptionPlan`, `.billingPeriod()`, `.constructor()`, `.currency()`, `.description()`, `.features()`, `.isActive()`, `.limits()`, `.name()`, `.price()`, `.restore()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (12 nodes): `Category`, `.color()`, `.constructor()`, `.create()`, `.description()`, `.getProps()`, `.icon()`, `.id()`, `.name()`, `.type()`, `.workspaceId()`, `Category.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (12 nodes): `ApiRouter`, `.configureRoutes()`, `.constructor()`, `.getRouter()`, `Server`, `.configureMiddleware()`, `.configureRoutes()`, `.constructor()`, `.getApp()`, `.start()`, `Server.ts`, `ApiRouter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (11 nodes): `WorkspaceRole.ts`, `WorkspaceRole`, `.changePermissions()`, `.constructor()`, `.create()`, `.description()`, `.isSystem()`, `.name()`, `.permissions()`, `.restore()`, `.workspaceId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (11 nodes): `MockAuthRequestRepository`, `.constructor()`, `.forgotPassword()`, `.login()`, `.resend2FA()`, `.resetPassword()`, `.verify2FA()`, `.verifyBackupCode()`, `.verifyEmail()`, `.verifyResetCode()`, `auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (10 nodes): `SubscriptionRepository.ts`, `SubscriptionPlanRepository`, `.constructor()`, `.mapToDb()`, `.mapToEntity()`, `UserSubscriptionRepository`, `.constructor()`, `.findByUserId()`, `.mapToDb()`, `.mapToEntity()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (10 nodes): `AuthIdentity`, `.changePassword()`, `.constructor()`, `.create()`, `.passwordHash()`, `.provider()`, `.updatedAt()`, `.updateLastLogin()`, `.userId()`, `AuthIdentity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (9 nodes): `ExchangeRate`, `.baseCurrency()`, `.constructor()`, `.create()`, `.fetchedAt()`, `.rate()`, `.targetCurrency()`, `.toJSON()`, `ExchangeRate.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (9 nodes): `KafkaMessageQueueFactory`, `.createMessageQueue()`, `MessagingFacade`, `.connect()`, `.constructor()`, `.publish()`, `.subscribe()`, `MessagingFacade.ts`, `KafkaMessageQueueFactory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (8 nodes): `DatabaseFacade`, `.connect()`, `.constructor()`, `.disconnect()`, `.query()`, `.raw()`, `.transaction()`, `DatabaseFacade.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (8 nodes): `MockFeatureFlagRequestRepository`, `.constructor()`, `.getAllFlags()`, `FeatureFlagController`, `.constructor()`, `.getAll()`, `FeatureFlagController.ts`, `feature-flags.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (8 nodes): `MetricsService`, `.constructor()`, `.getContentType()`, `.getInstance()`, `.getMetrics()`, `.getRegistry()`, `.initializeDefaultMetrics()`, `MetricsService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (7 nodes): `CacheFacade`, `.connect()`, `.constructor()`, `.disconnect()`, `.get()`, `.set()`, `CacheFacade.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (7 nodes): `FeatureFlagRequestRepository`, `.getAllFlags()`, `.getMode()`, `.isEnabled()`, `.service()`, `.wrap()`, `FeatureFlagRequestRepository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (6 nodes): `UserController.ts`, `UserController`, `.constructor()`, `.getProfile()`, `.updateProfile()`, `.uploadAvatar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (6 nodes): `Email`, `.constructor()`, `.create()`, `.raw()`, `.validate()`, `Email.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (5 nodes): `version.middleware.ts`, `UrlVersionStrategy.ts`, `UrlVersionStrategy`, `.extract()`, `versionMiddleware()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (4 nodes): `AppError`, `.constructor()`, `AppError.ts`, `AppError.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (4 nodes): `UserControllerFactory.ts`, `UserControllerFactory`, `.constructor()`, `.create()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (4 nodes): `WorkspaceRolesControllerFactory.ts`, `WorkspaceRolesControllerFactory`, `.constructor()`, `.create()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (4 nodes): `FeatureFlagControllerFactory`, `.constructor()`, `.create()`, `FeatureFlagControllerFactory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (4 nodes): `AuthControllerFactory`, `.constructor()`, `.create()`, `AuthControllerFactory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (4 nodes): `WorkspaceControllerFactory.ts`, `WorkspaceControllerFactory`, `.constructor()`, `.create()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `findById()` connect `Auth Service` to `Account Repository`, `Bootstrap & Controllers`, `Config & Middleware`, `Auth Request Repository`, `Account Service`, `Category Controller`, `Feature Flags`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `authMiddleware()` connect `Bootstrap & Controllers` to `Account Controller`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `verify()` connect `Bootstrap & Controllers` to `Account Repository`, `Config & Middleware`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `findById()` (e.g. with `.subscribe()` and `.upgrade()`) actually correct?**
  _`findById()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `save()` (e.g. with `.subscribe()` and `.upgrade()`) actually correct?**
  _`save()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Should `Account Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Bootstrap & Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._