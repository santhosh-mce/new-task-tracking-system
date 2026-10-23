from typing import Generic, TypeVar

from pydantic import BaseModel, Field


Item = TypeVar("Item")


class PageResponse(BaseModel, Generic[Item]):
    items: list[Item]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
