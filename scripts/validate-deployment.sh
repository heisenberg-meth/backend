#!/bin/bash
# Deployment Validation Script for MedAssist Backend
# Run before deploying to catch configuration issues

set -e

echo "=== MedAssist Deployment Validation ==="
echo ""

ERRORS=0
WARNINGS=0

check_env() {
    local var_name=$1
    local required=$2
    local value="${!var_name}"

    if [ -z "$value" ]; then
        if [ "$required" = "required" ]; then
            echo "  ❌ MISSING: $var_name (required)"
            ERRORS=$((ERRORS + 1))
        else
            echo "  ⚠️  MISSING: $var_name (optional)"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo "  ✅ $var_name is set"
    fi
}

echo "1. Checking Environment Variables..."
echo ""

check_env "DATABASE_URL" "required"
check_env "REDIS_URL" "required"
check_env "JWT_SECRET" "required"
check_env "COOKIE_SECRET" "required"
check_env "ENCRYPTION_KEY" "required"
check_env "FRONTEND_URL" "required"
check_env "RAZORPAY_KEY_ID" "optional"
check_env "RAZORPAY_KEY_SECRET" "optional"
check_env "SENTRY_DSN" "optional"
check_env "MEDIA_BASE_URL" "optional"
check_env "AWS_BUCKET_NAME" "optional"
check_env "CLOUDINARY_CLOUD_NAME" "optional"

echo ""
echo "2. Checking JWT_SECRET length..."
if [ -n "$JWT_SECRET" ]; then
    JWT_LEN=${#JWT_SECRET}
    if [ $JWT_LEN -lt 64 ]; then
        echo "  ❌ JWT_SECRET is only $JWT_LEN chars (minimum 64)"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ JWT_SECRET is $JWT_LEN chars"
    fi
fi

echo ""
echo "3. Checking ENCRYPTION_KEY format..."
if [ -n "$ENCRYPTION_KEY" ]; then
    ENC_LEN=${#ENCRYPTION_KEY}
    if [ $ENC_LEN -ne 64 ]; then
        echo "  ❌ ENCRYPTION_KEY is $ENC_LEN chars (must be exactly 64 hex chars)"
        ERRORS=$((ERRORS + 1))
    elif ! [[ "$ENC_KEY" =~ ^[0-9a-fA-F]+$ ]]; then
        echo "  ❌ ENCRYPTION_KEY contains non-hex characters"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ ENCRYPTION_KEY is valid"
    fi
fi

echo ""
echo "4. Checking NODE_ENV..."
if [ "$NODE_ENV" = "production" ]; then
    echo "  ✅ NODE_ENV is production"
else
    echo "  ⚠️  NODE_ENV is '$NODE_ENV' (expected 'production')"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "5. Checking database connectivity..."
if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
        echo "  ✅ Database connection successful"
    else
        echo "  ❌ Database connection failed"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  ⚠️  psql not found, skipping database check"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "6. Checking Prisma schema sync..."
if command -v npx &> /dev/null; then
    MIGRATION_STATUS=$(npx prisma migrate status 2>&1)
    if echo "$MIGRATION_STATUS" | grep -q "No pending migrations"; then
        echo "  ✅ Prisma schema is in sync"
    elif echo "$MIGRATION_STATUS" | grep -q "pending migrations"; then
        echo "  ❌ Pending migrations detected"
        echo "  Run: npx prisma migrate deploy"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ⚠️  Could not determine migration status"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""
echo "7. Checking uploads directory..."
UPLOADS_DIR="uploads"
if [ -d "$UPLOADS_DIR" ]; then
    echo "  ✅ uploads/ directory exists"
else
    echo "  ⚠️  uploads/ directory missing (will be created on first upload)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "8. Checking Redis eviction policy..."
if command -v redis-cli &> /dev/null; then
    POLICY=$(redis-cli CONFIG GET maxmemory-policy 2>/dev/null | tail -1)
    if [ "$POLICY" = "noeviction" ]; then
        echo "  ✅ Redis eviction policy is noeviction"
    else
        echo "  ⚠️  Redis eviction policy is '$POLICY' (expected 'noeviction')"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ⚠️  redis-cli not found, skipping eviction check"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "=== Summary ==="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "❌ DEPLOYMENT BLOCKED: Fix $ERRORS error(s) before deploying"
    exit 1
else
    echo "✅ DEPLOYMENT READY: $WARNINGS warning(s) can be addressed post-deploy"
    exit 0
fi
