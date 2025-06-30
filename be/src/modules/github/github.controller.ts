//github.controller.ts
import { Request, Response } from "express";
import { githubService } from "./github.service";

export const listRepos = async (req: Request, res: Response) => {
  const repos = await githubService.listRepos(
    req.headers["x-gh-token"] as string,
  );
  res.json(repos);
};
