import { Octokit } from "octokit";

class GithubService {
  async listRepos(token: string) {
    const ok = new Octokit({ auth: token });
    const { data } = await ok.rest.repos.listForAuthenticatedUser();
    return data.map((r) => ({ id: r.id, name: r.full_name, url: r.html_url }));
  }
}

export const githubService = new GithubService();
