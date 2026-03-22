diff --git a/python-backend/app/llm_proxy/gateway_unified.py b/python-backend/app/llm_proxy/gateway_unified.py
index c0632752..fb2c2412 100644
--- a/python-backend/app/llm_proxy/gateway_unified.py
+++ b/python-backend/app/llm_proxy/gateway_unified.py
@@ -118,6 +118,8 @@ class LLMGateway:
             return "kie_ai"
         if normalized in {"uvoice", "u_voice", "uvoice_ai", "uvoiceapp"}:
             return "uvoice"
+        if normalized in {"fal", "fal_ai", "falai", "fal_ai_provider"}:
+            return "fal_ai"
         return normalized
 
     @staticmethod
@@ -649,6 +651,56 @@ class LLMGateway:
                     await client.aclose()
         # --- End BytePlus routing ---
 
+        # --- fal.ai image routing ---
+        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider as FalAIImageProvider
+        fal_image_models = {self._normalize_model_id(m) for m in FalAIImageProvider.IMAGE_MODELS}
+        route_to_fal_img = (
+            resolved_provider == "fal_ai"
+            or normalized_model in fal_image_models
+        )
+        if route_to_fal_img:
+            from app.services.media_provider_service import get_media_provider_key as get_fal_img_key
+            provider_config_fal = await get_fal_img_key("fal_ai")
+            if not provider_config_fal or not provider_config_fal.get("apiKey"):
+                raise HTTPException(
+                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+                    detail="fal.ai not configured. Please add API key in Admin > Media Providers.",
+                )
+            fal_client = None
+            try:
+                fal_client = FalAIImageProvider(api_key=provider_config_fal["apiKey"])
+                extra = request.extra_params if isinstance(request.extra_params, dict) else {}
+                if request.prompt:
+                    extra["prompt"] = request.prompt
+                result = await fal_client.generate_image(request.model, extra)
+                response = ImageGenerationResponse(
+                    id="",
+                    model=request.model,
+                    provider="fal_ai",
+                    created=0,
+                    data=result.get("data", []),
+                )
+                actual_cost = estimated_cost
+                transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
+                response.credits_used = abs(transaction.amount)
+                response.credits_balance = transaction.balance_after
+                write_media_debug_event("image.generate.fal_ai.success", {
+                    "trace_id": trace_id,
+                    "user_id": user.id,
+                    "model": request.model,
+                    "log_file": log_file,
+                })
+                return response
+            except HTTPException:
+                raise
+            except Exception as e:
+                logger.error("fal_ai_image_generation_failed", user_id=user.id, model=request.model, error=str(e))
+                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="fal.ai image generation failed")
+            finally:
+                if fal_client is not None:
+                    await fal_client.aclose()
+        # --- End fal.ai image routing ---
+
         write_media_debug_event("image.generate.fallback_to_kie", {
             "trace_id": trace_id,
             "user_id": user.id,
@@ -898,6 +950,50 @@ class LLMGateway:
                     await client.aclose()
         # --- End BytePlus routing ---
 
+        # --- fal.ai routing ---
+        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
+        fal_video_models = {self._normalize_model_id(m) for m in FalAIProvider.VIDEO_MODELS}
+        route_to_fal = (
+            resolved_provider == "fal_ai"
+            or normalized_model in fal_video_models
+        )
+        if route_to_fal:
+            await self._check_fal_concurrent_limit(user.id)
+            from app.services.media_provider_service import get_media_provider_key
+            provider_config = await get_media_provider_key("fal_ai")
+            if not provider_config or not provider_config.get("apiKey"):
+                raise HTTPException(
+                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+                    detail="fal.ai not configured. Please add API key in Admin > Media Providers.",
+                )
+            fal_client = None
+            try:
+                fal_client = FalAIProvider(api_key=provider_config["apiKey"])
+                extra = request.extra_params or {}
+                if request.prompt:
+                    extra["prompt"] = request.prompt
+                result = await fal_client.generate_video(request.model, extra)
+                response = VideoGenerationResponse(
+                    id=result["id"],
+                    model=request.model,
+                    provider="fal_ai",
+                    created=0,
+                    data=[],
+                )
+                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
+                response.credits_used = abs(transaction.amount)
+                response.credits_balance = transaction.balance_after
+                return response
+            except HTTPException:
+                raise
+            except Exception as e:
+                logger.error("fal_ai_video_generation_failed", user_id=user.id, model=request.model, error=str(e))
+                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="fal.ai video generation failed")
+            finally:
+                if fal_client is not None:
+                    await fal_client.aclose()
+        # --- End fal.ai routing ---
+
         if not self.unified_client.kie_ai_client:
             # Try to initialize from SmartSpecWeb media_providers
             from app.services.media_provider_service import initialize_kie_ai_client
@@ -1144,6 +1240,49 @@ class LLMGateway:
                     except Exception:
                         pass
 
+        # --- fal.ai audio routing ---
+        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider as FalAIAudioProvider
+        fal_audio_models = {self._normalize_model_id(m) for m in FalAIAudioProvider.AUDIO_MODELS}
+        route_to_fal_audio = (
+            resolved_provider == "fal_ai"
+            or normalized_model in fal_audio_models
+        )
+        if route_to_fal_audio:
+            from app.services.media_provider_service import get_media_provider_key as get_fal_audio_key
+            provider_config_fal = await get_fal_audio_key("fal_ai")
+            if not provider_config_fal or not provider_config_fal.get("apiKey"):
+                raise HTTPException(
+                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+                    detail="fal.ai not configured. Please add API key in Admin > Media Providers.",
+                )
+            fal_client = None
+            try:
+                fal_client = FalAIAudioProvider(api_key=provider_config_fal["apiKey"])
+                extra = normalized_request.extra_params if isinstance(normalized_request.extra_params, dict) else {}
+                if normalized_request.text:
+                    extra["text"] = normalized_request.text
+                result = await fal_client.generate_audio(normalized_request.model, extra)
+                response = AudioGenerationResponse(
+                    id="",
+                    model=normalized_request.model,
+                    provider="fal_ai",
+                    created=0,
+                    data=result.get("data", []),
+                )
+                transaction = await self._deduct_credits(user, estimated_cost, normalized_request, response, estimated_cost, False)
+                response.credits_used = abs(transaction.amount)
+                response.credits_balance = transaction.balance_after
+                return response
+            except HTTPException:
+                raise
+            except Exception as e:
+                logger.error("fal_ai_audio_generation_failed", user_id=user.id, model=normalized_request.model, error=str(e))
+                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="fal.ai audio generation failed")
+            finally:
+                if fal_client is not None:
+                    await fal_client.aclose()
+        # --- End fal.ai audio routing ---
+
         if not self.unified_client.kie_ai_client:
             # Try to initialize from SmartSpecWeb media_providers
             from app.services.media_provider_service import initialize_kie_ai_client
@@ -1464,6 +1603,23 @@ class LLMGateway:
             )
             return transaction
 
+    async def _check_fal_concurrent_limit(self, user_id: int, max_concurrent: int = 3) -> None:
+        """Raise HTTPException 429 if user has >= max_concurrent in-flight fal.ai video tasks."""
+        from sqlalchemy import text as sa_text
+        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider as _FalProvider
+        model_list = ",".join(f"'{m}'" for m in _FalProvider.VIDEO_MODELS)
+        query = sa_text(
+            f'SELECT count(*) FROM media_tasks WHERE "userId" = :uid '
+            f"AND status = 'PROCESSING' AND model IN ({model_list})"
+        )
+        result = await self.db.execute(query, {"uid": user_id})
+        count = result.scalar() or 0
+        if count >= max_concurrent:
+            raise HTTPException(
+                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
+                detail=f"Maximum {max_concurrent} concurrent fal.ai video tasks. Please wait for existing tasks to complete.",
+            )
+
     async def _check_credits(self, user: User, estimated_cost: Decimal) -> None:
         """Check if user has sufficient credits."""
         has_credits = await self.credit_service.check_sufficient_credits(
