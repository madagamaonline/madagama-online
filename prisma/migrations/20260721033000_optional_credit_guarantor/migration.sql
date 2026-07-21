-- Allow a credit sale to be opened before guarantor details are collected.
ALTER TABLE "CreditAgreement"
ALTER COLUMN "guarantorId" DROP NOT NULL;
