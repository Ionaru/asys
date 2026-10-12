-- SPDX-License-Identifier: EUPL-1.2
CREATE TYPE "palette" AS ENUM('evergreen', 'harbour', 'moss', 'graphite');--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "palette" "palette";