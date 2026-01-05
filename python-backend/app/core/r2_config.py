"""
SmartSpec Pro - Cloudflare R2 Configuration
Configuration and utilities for Cloudflare R2 storage.
"""

import os
from dataclasses import dataclass
from typing import Optional

import boto3
from botocore.config import Config


@dataclass
class R2Config:
    """Cloudflare R2 configuration."""
    
    # R2 Credentials
    access_key_id: str
    secret_access_key: str
    
    # Bucket settings
    bucket_name: str
    endpoint_url: str
    
    # Public URL for serving files
    public_url: str
    
    # Optional: Custom domain
    custom_domain: Optional[str] = None
    
    # Region (R2 uses 'auto')
    region: str = "auto"
    
    @classmethod
    def from_env(cls) -> "R2Config":
        """Create configuration from environment variables."""
        return cls(
            access_key_id=os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", ""),
            secret_access_key=os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", ""),
            bucket_name=os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "smartspec-media"),
            endpoint_url=os.getenv("CLOUDFLARE_R2_ENDPOINT", ""),
            public_url=os.getenv("CLOUDFLARE_R2_PUBLIC_URL", ""),
            custom_domain=os.getenv("CLOUDFLARE_R2_CUSTOM_DOMAIN"),
            region=os.getenv("CLOUDFLARE_R2_REGION", "auto"),
        )
    
    @property
    def is_configured(self) -> bool:
        """Check if R2 is properly configured."""
        return all([
            self.access_key_id,
            self.secret_access_key,
            self.bucket_name,
            self.endpoint_url,
        ])
    
    def get_public_url(self, key: str) -> str:
        """Get public URL for a file."""
        base_url = self.custom_domain or self.public_url
        if base_url:
            return f"{base_url.rstrip('/')}/{key}"
        return f"{self.endpoint_url}/{self.bucket_name}/{key}"


class R2Client:
    """
    Cloudflare R2 client wrapper.
    
    Provides a configured boto3 S3 client for R2 operations.
    """
    
    def __init__(self, config: Optional[R2Config] = None):
        self.config = config or R2Config.from_env()
        self._client = None
    
    @property
    def client(self):
        """Get or create S3 client."""
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.config.endpoint_url,
                aws_access_key_id=self.config.access_key_id,
                aws_secret_access_key=self.config.secret_access_key,
                region_name=self.config.region,
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                    retries={"max_attempts": 3, "mode": "standard"},
                ),
            )
        return self._client
    
    @property
    def bucket(self) -> str:
        """Get bucket name."""
        return self.config.bucket_name
    
    def upload_file(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
        public: bool = True,
    ) -> str:
        """
        Upload a file to R2.
        
        Args:
            file_path: Local file path
            key: S3 key (path in bucket)
            content_type: MIME type
            metadata: Additional metadata
            public: Whether to make file publicly accessible
            
        Returns:
            Public URL of uploaded file
        """
        extra_args = {}
        
        if content_type:
            extra_args["ContentType"] = content_type
        
        if metadata:
            extra_args["Metadata"] = metadata
        
        if public:
            extra_args["ACL"] = "public-read"
        
        self.client.upload_file(
            file_path,
            self.bucket,
            key,
            ExtraArgs=extra_args if extra_args else None,
        )
        
        return self.config.get_public_url(key)
    
    def upload_fileobj(
        self,
        fileobj,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
        public: bool = True,
    ) -> str:
        """
        Upload a file object to R2.
        
        Args:
            fileobj: File-like object
            key: S3 key (path in bucket)
            content_type: MIME type
            metadata: Additional metadata
            public: Whether to make file publicly accessible
            
        Returns:
            Public URL of uploaded file
        """
        extra_args = {}
        
        if content_type:
            extra_args["ContentType"] = content_type
        
        if metadata:
            extra_args["Metadata"] = metadata
        
        if public:
            extra_args["ACL"] = "public-read"
        
        self.client.upload_fileobj(
            fileobj,
            self.bucket,
            key,
            ExtraArgs=extra_args if extra_args else None,
        )
        
        return self.config.get_public_url(key)
    
    def download_file(self, key: str, file_path: str):
        """Download a file from R2."""
        self.client.download_file(self.bucket, key, file_path)
    
    def delete_file(self, key: str):
        """Delete a file from R2."""
        self.client.delete_object(Bucket=self.bucket, Key=key)
    
    def delete_files(self, keys: list):
        """Delete multiple files from R2."""
        if not keys:
            return
        
        objects = [{"Key": key} for key in keys]
        self.client.delete_objects(
            Bucket=self.bucket,
            Delete={"Objects": objects},
        )
    
    def file_exists(self, key: str) -> bool:
        """Check if a file exists in R2."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except:
            return False
    
    def get_file_info(self, key: str) -> Optional[dict]:
        """Get file metadata."""
        try:
            response = self.client.head_object(Bucket=self.bucket, Key=key)
            return {
                "key": key,
                "size": response.get("ContentLength", 0),
                "content_type": response.get("ContentType"),
                "last_modified": response.get("LastModified"),
                "metadata": response.get("Metadata", {}),
            }
        except:
            return None
    
    def list_files(
        self,
        prefix: str = "",
        max_keys: int = 1000,
        continuation_token: Optional[str] = None,
    ) -> dict:
        """
        List files in R2.
        
        Returns:
            Dict with 'files', 'next_token', 'is_truncated'
        """
        params = {
            "Bucket": self.bucket,
            "MaxKeys": max_keys,
        }
        
        if prefix:
            params["Prefix"] = prefix
        
        if continuation_token:
            params["ContinuationToken"] = continuation_token
        
        response = self.client.list_objects_v2(**params)
        
        files = []
        for obj in response.get("Contents", []):
            files.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"],
            })
        
        return {
            "files": files,
            "next_token": response.get("NextContinuationToken"),
            "is_truncated": response.get("IsTruncated", False),
        }
    
    def generate_presigned_url(
        self,
        key: str,
        expires_in: int = 3600,
        method: str = "get_object",
    ) -> str:
        """
        Generate a presigned URL.
        
        Args:
            key: S3 key
            expires_in: Expiration in seconds
            method: 'get_object' for download, 'put_object' for upload
            
        Returns:
            Presigned URL
        """
        return self.client.generate_presigned_url(
            method,
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )
    
    def get_bucket_size(self) -> dict:
        """
        Calculate total bucket size.
        
        Returns:
            Dict with 'total_size', 'file_count'
        """
        total_size = 0
        file_count = 0
        continuation_token = None
        
        while True:
            result = self.list_files(continuation_token=continuation_token)
            
            for file in result["files"]:
                total_size += file["size"]
                file_count += 1
            
            if not result["is_truncated"]:
                break
            
            continuation_token = result["next_token"]
        
        return {
            "total_size": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "total_size_gb": round(total_size / (1024 * 1024 * 1024), 4),
            "file_count": file_count,
        }


# =============================================================================
# FACTORY FUNCTIONS
# =============================================================================

_r2_client: Optional[R2Client] = None


def get_r2_client() -> R2Client:
    """Get R2 client singleton."""
    global _r2_client
    if _r2_client is None:
        _r2_client = R2Client()
    return _r2_client


def get_r2_config() -> R2Config:
    """Get R2 configuration."""
    return R2Config.from_env()
